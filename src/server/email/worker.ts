// Background email engine. Runs inside the Next.js server process (started from
// src/instrumentation.ts) and can also be poked by a cron URL (/api/e/cron).
//
// Every claim is an atomic "UPDATE … WHERE status = X", so two processes pointed at the same
// database (e.g. your PC and Hostinger) never send the same email twice.

import { prisma } from "../db";
import { getBranding } from "../settings";
import { normalizeAudience, normalizeSteps, stringArray, WAIT_MS } from "@/lib/email";
import { resolveAudience } from "./audience";
import { buildEmail, deliver, friendlyMailError } from "./mailer";
import { syncAllInboxes } from "./imap";
import type { EmailAccount } from "@prisma/client";

const TICK_MS = 15_000;
const IMAP_EVERY_MS = 2 * 60_000;
const STALE_CLAIM_MS = 10 * 60_000;

type WorkerState = { timer?: NodeJS.Timeout; busy: boolean; lastImap: number };
const g = globalThis as unknown as { __scrmEmailWorker?: WorkerState };

export function startEmailWorker() {
  if (process.env.EMAIL_WORKER === "off" || g.__scrmEmailWorker) return;
  const state: WorkerState = { busy: false, lastImap: 0 };
  g.__scrmEmailWorker = state;
  state.timer = setInterval(() => void runEmailTick(), TICK_MS);
  state.timer.unref?.();
  console.log("[email] worker started");
}

/** One pass of the engine. Safe to call concurrently (later calls no-op while busy). */
export async function runEmailTick(opts: { imap?: boolean } = {}) {
  const state = (g.__scrmEmailWorker ??= { busy: false, lastImap: 0 });
  if (state.busy) return { skipped: true };
  state.busy = true;
  try {
    await recoverStaleClaims();
    await startDueCampaigns();
    await advanceAutomations();
    const sent = await sendQueued();
    await finishCampaigns();
    if (opts.imap || Date.now() - state.lastImap > IMAP_EVERY_MS) {
      state.lastImap = Date.now();
      await syncAllInboxes().catch((e) => console.error("[email] inbox sync failed", e));
    }
    return { skipped: false, sent };
  } catch (e) {
    console.error("[email] tick failed", e);
    return { skipped: false, error: true };
  } finally {
    state.busy = false;
  }
}

// ─── Campaigns ───────────────────────────────────────────────

/** Create the recipient rows for a campaign that has just been claimed for sending. */
export async function materializeCampaign(campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) return 0;
  const leads = await resolveAudience(normalizeAudience(c.audience));
  for (let i = 0; i < leads.length; i += 1000) {
    await prisma.emailSend.createMany({
      data: leads.slice(i, i + 1000).map((l) => ({
        campaignId: c.id,
        leadId: l.id,
        email: (l.email ?? "").trim(),
        subject: c.subject.slice(0, 500),
      })),
      skipDuplicates: true,
    });
  }
  const count = await prisma.emailSend.count({ where: { campaignId: c.id } });
  await prisma.campaign.update({ where: { id: c.id }, data: { recipientCount: count } });
  return count;
}

async function startDueCampaigns() {
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 10,
  });
  for (const { id } of due) {
    const claimed = await prisma.campaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: new Date() },
    });
    if (claimed.count === 1) await materializeCampaign(id);
  }
}

async function finishCampaigns() {
  const sending = await prisma.campaign.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const { id } of sending) {
    const left = await prisma.emailSend.count({ where: { campaignId: id, status: { in: ["QUEUED", "SENDING"] } } });
    if (left === 0) await prisma.campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date() } });
  }
}

/** A send claimed by a process that died mid-way: don't risk a double send, mark it failed. */
async function recoverStaleClaims() {
  await prisma.emailSend.updateMany({
    where: { status: "SENDING", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "FAILED", error: "Interrupted while sending (server restarted)." },
  });
}

// ─── Automations ─────────────────────────────────────────────

async function advanceAutomations() {
  const now = new Date();
  const due = await prisma.automationEnrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now }, automation: { status: "ACTIVE" } },
    include: { automation: true, lead: { select: { id: true, email: true, emailOptOut: true, emailBouncedAt: true } } },
    orderBy: { nextRunAt: "asc" },
    take: 200,
  });

  for (const e of due) {
    const stop = (reason: string, status: "STOPPED" | "COMPLETED" = "STOPPED") =>
      prisma.automationEnrollment.updateMany({
        where: { id: e.id, status: "ACTIVE" },
        data: { status, stopReason: reason, finishedAt: now, nextRunAt: null },
      });

    const email = (e.lead.email ?? "").trim();
    if (!email.includes("@")) { await stop("No email address"); continue; }
    if (e.lead.emailOptOut) { await stop("Unsubscribed"); continue; }
    if (e.lead.emailBouncedAt) { await stop("Email bounced"); continue; }
    if (e.automation.stopOnReply) {
      const replied = await prisma.inboxMessage.count({
        where: { direction: "IN", fromEmail: email.toLowerCase(), sentAt: { gt: e.enrolledAt } },
      });
      if (replied > 0) { await stop("Replied"); continue; }
    }

    const steps = normalizeSteps(e.automation.steps);
    const step = steps[e.stepIndex];
    if (!step) { await stop("Finished all steps", "COMPLETED"); continue; }

    const nextRunAt = step.type === "wait" ? new Date(now.getTime() + step.amount * WAIT_MS[step.unit]) : now;
    // Claim this step: only one process may advance it.
    const claimed = await prisma.automationEnrollment.updateMany({
      where: { id: e.id, status: "ACTIVE", stepIndex: e.stepIndex },
      data: { stepIndex: e.stepIndex + 1, nextRunAt },
    });
    if (claimed.count !== 1 || step.type !== "email") continue;

    await prisma.emailSend.create({
      data: {
        automationId: e.automationId,
        stepIndex: e.stepIndex,
        leadId: e.leadId,
        email,
        subject: step.subject.slice(0, 500),
      },
    });
  }
}

// ─── Sending ─────────────────────────────────────────────────

const ACCOUNT_LEVEL = new Set(["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "ENOTFOUND", "ECONNREFUSED", "EDNS", "ETLS", "EDECRYPT"]);

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function sendQueued(): Promise<number> {
  const accounts = await prisma.emailAccount.findMany({ where: { status: { in: ["CONNECTED", "PENDING"] } } });
  if (!accounts.length) return 0;
  const branding = await getBranding();
  const today = utcDay();
  let total = 0;

  for (const acc of accounts) {
    const sentToday = acc.sentDay === today ? acc.sentToday : 0;
    let capacity = Math.max(0, acc.dailyLimit - sentToday);
    if (!capacity) continue;
    const gapMs = Math.max(5, acc.minDelaySec) * 1000;
    if (acc.lastSentAt && Date.now() - acc.lastSentAt.getTime() < gapMs - 1000) continue;
    // Several per tick only when the configured gap is shorter than the tick.
    let burst = Math.max(1, Math.min(10, Math.floor(TICK_MS / gapMs)));

    while (burst-- > 0 && capacity-- > 0) {
      const outcome = await sendOne(acc, branding.agencyName || branding.appName);
      if (outcome === "none" || outcome === "account-error") break;
      if (outcome === "sent") total++;
      if (burst > 0) await new Promise((r) => setTimeout(r, gapMs));
    }
  }
  return total;
}

type Outcome = "none" | "sent" | "skipped" | "failed" | "account-error";

async function sendOne(acc: EmailAccount, agencyName: string): Promise<Outcome> {
  const next = await prisma.emailSend.findFirst({
    where: {
      status: "QUEUED",
      OR: [
        { campaign: { status: "SENDING", accountIds: { array_contains: [acc.id] } } },
        { automation: { status: "ACTIVE", accountIds: { array_contains: [acc.id] } } },
      ],
    },
    orderBy: { queuedAt: "asc" },
    include: { campaign: true, automation: true, lead: true },
  });
  if (!next) return "none";

  const claimed = await prisma.emailSend.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "SENDING", accountId: acc.id, claimedAt: new Date() },
  });
  if (claimed.count !== 1) return "skipped";

  const lead = next.lead;
  const skip = (reason: string) =>
    prisma.emailSend.update({ where: { id: next.id }, data: { status: "SKIPPED", error: reason } }).then(() => "skipped" as const);
  if (!lead || !(lead.email ?? "").includes("@")) return skip("Contact has no email address");
  if (lead.emailOptOut) return skip("Contact unsubscribed");
  if (lead.emailBouncedAt) return skip("Contact's email bounced before");

  let content: { subject: string; html: string; previewText: string; fromName: string; replyTo: string; trackOpens: boolean; trackClicks: boolean; addUnsubscribe: boolean };
  if (next.campaign) {
    const c = next.campaign;
    content = { subject: c.subject, html: c.html, previewText: c.previewText, fromName: c.fromName, replyTo: c.replyTo, trackOpens: c.trackOpens, trackClicks: c.trackClicks, addUnsubscribe: c.addUnsubscribe };
  } else if (next.automation) {
    const step = normalizeSteps(next.automation.steps)[next.stepIndex ?? -1];
    if (!step || step.type !== "email") return skip("Automation step was removed");
    content = { subject: step.subject, html: step.html, previewText: "", fromName: "", replyTo: "", trackOpens: true, trackClicks: true, addUnsubscribe: true };
  } else {
    return skip("Campaign or automation was deleted");
  }

  try {
    const built = buildEmail(acc, lead, { sendId: next.id, agencyName, ...content });
    await deliver(acc, built);
    const now = new Date();
    await prisma.$transaction([
      prisma.emailSend.update({ where: { id: next.id }, data: { status: "SENT", sentAt: now, messageId: built.messageId, subject: built.subject.slice(0, 500), error: null } }),
      prisma.emailAccount.update({
        where: { id: acc.id },
        data:
          acc.sentDay === utcDay(now)
            ? { sentToday: { increment: 1 }, lastSentAt: now, status: "CONNECTED", lastError: null }
            : { sentToday: 1, sentDay: utcDay(now), lastSentAt: now, status: "CONNECTED", lastError: null },
      }),
      prisma.lead.update({ where: { id: lead.id }, data: { lastEmailedAt: now } }),
    ]);
    acc.sentDay = utcDay(now);
    acc.lastSentAt = now;
    return "sent";
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    const message = friendlyMailError(e, acc.smtpHost);
    if (ACCOUNT_LEVEL.has(err.code ?? "") || (err.responseCode ?? 0) === 535 || (err.responseCode ?? 0) === 421) {
      // The mailbox is the problem, not this recipient: put the email back and pause the mailbox.
      await prisma.$transaction([
        prisma.emailSend.update({ where: { id: next.id }, data: { status: "QUEUED", accountId: null, claimedAt: null } }),
        prisma.emailAccount.update({ where: { id: acc.id }, data: { status: "ERROR", lastError: message } }),
      ]);
      return "account-error";
    }
    const hardBounce = (err.responseCode ?? 0) >= 550 && (err.responseCode ?? 0) <= 553;
    await prisma.emailSend.update({
      where: { id: next.id },
      data: { status: "FAILED", error: message, ...(hardBounce ? { bouncedAt: new Date() } : {}) },
    });
    if (hardBounce) await prisma.lead.update({ where: { id: lead.id }, data: { emailBouncedAt: new Date() } });
    return "failed";
  }
}
