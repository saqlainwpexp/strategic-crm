import { agencyContext, publicUrl } from "../agencies";
import { systemDb } from "../system-db";
// Background email engine. Runs inside the Next.js server process (started from
// src/instrumentation.ts) and can also be poked by a cron URL (/api/e/cron).
//
// Every claim is an atomic "UPDATE … WHERE status = X", so two processes pointed at the same
// database (e.g. your PC and Hostinger) never send the same email twice.

import { getDb, getAgency } from "../db";
import { getBranding } from "../settings";
import { normalizeAudience, normalizeTags, WAIT_MS } from "@/lib/email";
import { nextNodeId, normalizeFlow, triggerNode, type ActionKind, type ConditionKind } from "@/lib/automation-flow";
import { PIPELINE_STAGES, tempFromScore, type PipelineStage } from "@/lib/constants";
import type { Settings } from "@/lib/types";
import { getSettings } from "../settings";
import { handOffToCalls, nextRep } from "./handoff";
import { fireTrigger } from "./triggers";
import { unsubscribeLead } from "./unsubscribe";
import { resolveAudience } from "./audience";
import { buildEmail, deliver, friendlyMailError } from "./mailer";
import { syncAllInboxes } from "./imap";
import type { AutomationEnrollment, EmailAccount } from "@prisma/client";

const TICK_MS = 15_000;
const IMAP_EVERY_MS = 2 * 60_000;
const STALE_CLAIM_MS = 10 * 60_000;

type WorkerState = { timer?: NodeJS.Timeout; busy: boolean; lastImap: number };
const g = globalThis as unknown as { __scrmEmailWorker?: WorkerState; agencyEmailStates?: Map<string, WorkerState> };

export async function runEmailTick(opts: { imap?: boolean } = {}) {
  const results = [];
  for (const row of await systemDb.agency.findMany({ where: { active: true } })) results.push(await agencyContext.run({ ...row, url: publicUrl() }, () => runAgencyTick(opts)));
  return { agencies: results };
}
export function startEmailWorker() {
  if (process.env.EMAIL_WORKER === "off" || g.__scrmEmailWorker) return;
  const state: WorkerState = { busy: false, lastImap: 0 };
  g.__scrmEmailWorker = state;
  state.timer = setInterval(() => void runEmailTick().catch(() => console.error("[email] Invalid agency configuration")), TICK_MS);
  state.timer.unref?.();
  console.log("[email] worker started");
}

/** One pass of the engine. Safe to call concurrently (later calls no-op while busy). */
export async function runAgencyTick(opts: { imap?: boolean } = {}) {
  const states = g.agencyEmailStates ??= new Map<string, WorkerState>();
  const id = (await getAgency()).id;
  const state = states.get(id) ?? { busy: false, lastImap: 0 };
  states.set(id, state);
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
  const c = await (await getDb()).campaign.findUnique({ where: { id: campaignId } });
  if (!c) return 0;
  const leads = await resolveAudience(normalizeAudience(c.audience));
  for (let i = 0; i < leads.length; i += 1000) {
    await (await getDb()).emailSend.createMany({
      data: leads.slice(i, i + 1000).map((l) => ({
        campaignId: c.id,
        leadId: l.id,
        email: (l.email ?? "").trim(),
        subject: c.subject.slice(0, 500),
      })),
      skipDuplicates: true,
    });
  }
  const count = await (await getDb()).emailSend.count({ where: { campaignId: c.id } });
  await (await getDb()).campaign.update({ where: { id: c.id }, data: { recipientCount: count } });
  return count;
}

async function startDueCampaigns() {
  const due = await (await getDb()).campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 10,
  });
  for (const { id } of due) {
    const claimed = await (await getDb()).campaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: new Date() },
    });
    if (claimed.count === 1) await materializeCampaign(id);
  }
}

async function finishCampaigns() {
  const sending = await (await getDb()).campaign.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const { id } of sending) {
    const left = await (await getDb()).emailSend.count({ where: { campaignId: id, status: { in: ["QUEUED", "SENDING"] } } });
    if (left === 0) await (await getDb()).campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date() } });
  }
}

/** A send claimed by a process that died mid-way: don't risk a double send, mark it failed. */
async function recoverStaleClaims() {
  await (await getDb()).emailSend.updateMany({
    where: { status: "SENDING", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "FAILED", error: "Interrupted while sending (server restarted)." },
  });
}

// ─── Automations ─────────────────────────────────────────────

const MAX_HOPS = 25; // instant steps (conditions/actions) run back-to-back in one pass

async function advanceAutomations() {
  const now = new Date();
  const due = await (await getDb()).automationEnrollment.findMany({
    where: { status: "ACTIVE", nextRunAt: { lte: now }, automation: { status: "ACTIVE" } },
    include: { automation: { select: { id: true, flow: true, stopOnReply: true } } },
    orderBy: { nextRunAt: "asc" },
    take: 200,
  });
  if (!due.length) return;
  const settings = await getSettings();

  for (const e of due) {
    // Lease the enrollment so a second process can't run the same step.
    const lease = await (await getDb()).automationEnrollment.updateMany({
      where: { id: e.id, status: "ACTIVE", nodeId: e.nodeId, nextRunAt: e.nextRunAt },
      data: { nextRunAt: new Date(now.getTime() + 10 * 60_000) },
    });
    if (lease.count !== 1) continue;
    try {
      await runEnrollment(e, settings);
    } catch (err) {
      console.error("[email] automation step failed", err);
      await (await getDb()).automationEnrollment.update({ where: { id: e.id }, data: { nextRunAt: new Date(Date.now() + 15 * 60_000) } });
    }
  }
}

type Due = AutomationEnrollment & { automation: { id: string; flow: unknown; stopOnReply: boolean } };

async function runEnrollment(e: Due, settings: Settings) {
  const now = new Date();
  const finish = async (status: "STOPPED" | "COMPLETED", reason: string) =>
    (await getDb()).automationEnrollment.update({ where: { id: e.id }, data: { status, stopReason: reason, finishedAt: now, nextRunAt: null } });

  const lead = await (await getDb()).lead.findUnique({ where: { id: e.leadId } });
  if (!lead) return finish("STOPPED", "Lead deleted");
  const email = (lead.email ?? "").trim();
  if (lead.emailOptOut) return finish("STOPPED", "Unsubscribed");
  if (e.automation.stopOnReply && email.includes("@")) {
    const replied = await (await getDb()).inboxMessage.count({ where: { direction: "IN", fromEmail: email.toLowerCase(), sentAt: { gt: e.enrolledAt } } });
    if (replied > 0) return finish("STOPPED", "Replied");
  }

  const flow = normalizeFlow(e.automation.flow);
  let nodeId: string | null = e.nodeId ?? nextNodeId(flow, triggerNode(flow).id);
  let steps = e.stepIndex;
  const tags = normalizeTags(lead.tags);

  const save = async (next: string | null, stepIndex: number, at: Date) => {
    if (!next) return finish("COMPLETED", "Finished the workflow");
    return (await getDb()).automationEnrollment.update({ where: { id: e.id }, data: { nodeId: next, stepIndex, nextRunAt: at } });
  };

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const node = nodeId ? flow.nodes.find((n) => n.id === nodeId) : null;
    if (!node) return finish("COMPLETED", "Finished the workflow");
    const d = node.data;
    steps++;

    if (d.kind === "email") {
      if (!email.includes("@") || lead.emailBouncedAt) return finish("STOPPED", lead.emailBouncedAt ? "Email bounced" : "No email address");
      await (await getDb()).emailSend.create({
        data: { automationId: e.automationId, nodeId: node.id, stepIndex: steps, leadId: lead.id, email, subject: d.subject.slice(0, 500) },
      });
      // Pause one tick so a following condition sees this email's result.
      return save(nextNodeId(flow, node.id), steps, now);
    }
    if (d.kind === "wait") {
      return save(nextNodeId(flow, node.id), steps, new Date(now.getTime() + d.amount * WAIT_MS[d.unit]));
    }
    if (d.kind === "condition") {
      const yes = await checkCondition(d.condition, d.value, {
        leadId: lead.id,
        email,
        stage: lead.stage,
        score: lead.leadScore,
        phone: lead.phone ?? "",
        tags,
        automationId: e.automationId,
        since: e.enrolledAt,
        settings,
      });
      nodeId = nextNodeId(flow, node.id, yes ? "yes" : "no");
      continue;
    }
    if (d.kind === "action") {
      await runAction(d.action, d.value, lead.id, tags);
      if (d.action === "unsubscribe") return finish("STOPPED", "Unsubscribed by workflow");
      nodeId = nextNodeId(flow, node.id);
      continue;
    }
    nodeId = nextNodeId(flow, node.id); // the trigger node itself
  }
  return save(nodeId, steps, now);
}

type CondCtx = { leadId: string; email: string; stage: string; score: number; phone: string; tags: string[]; automationId: string; since: Date; settings: Settings };

async function checkCondition(kind: ConditionKind, value: string, c: CondCtx): Promise<boolean> {
  switch (kind) {
    case "opened":
    case "clicked": {
      const last = await (await getDb()).emailSend.findFirst({ where: { automationId: c.automationId, leadId: c.leadId }, orderBy: { queuedAt: "desc" } });
      return kind === "opened" ? !!last?.openedAt : !!last?.clickedAt;
    }
    case "replied": {
      if (!c.email) return false;
      const n = await (await getDb()).inboxMessage.count({ where: { direction: "IN", fromEmail: c.email.toLowerCase(), sentAt: { gt: c.since } } });
      return n > 0;
    }
    case "has_tag":
      return c.tags.includes(value);
    case "stage_is":
      return c.stage === value;
    case "temperature_is":
      return tempFromScore(c.score, c.settings.hotThreshold, c.settings.warmThreshold) === value;
    case "has_phone":
      return c.phone.replace(/\D/g, "").length >= 7;
  }
}

async function runAction(kind: ActionKind, value: string, leadId: string, tags: string[]) {
  switch (kind) {
    case "send_to_calls":
      await handOffToCalls(leadId, { repId: value || null, note: "Email workflow handed this lead to calls." });
      return;
    case "add_tag":
      if (value && !tags.includes(value)) {
        tags.push(value);
        await (await getDb()).lead.update({ where: { id: leadId }, data: { tags } });
        await fireTrigger("TAG_ADDED", [leadId], value);
      }
      return;
    case "remove_tag":
      if (tags.includes(value)) {
        tags.splice(tags.indexOf(value), 1);
        await (await getDb()).lead.update({ where: { id: leadId }, data: { tags } });
      }
      return;
    case "move_stage":
      if ((PIPELINE_STAGES as readonly string[]).includes(value)) {
        await (await getDb()).lead.update({
          where: { id: leadId },
          data: { stage: value as PipelineStage, closedAt: value === "CLOSED_WON" ? new Date() : null },
        });
        await fireTrigger("STAGE_CHANGED", [leadId], value);
      }
      return;
    case "assign_rep": {
      const rep = value || (await nextRep());
      if (rep) await (await getDb()).lead.update({ where: { id: leadId }, data: { assignedToId: rep } });
      return;
    }
    case "unsubscribe":
      await unsubscribeLead(leadId);
      return;
  }
}

// ─── Sending ─────────────────────────────────────────────────

const ACCOUNT_LEVEL = new Set(["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "ENOTFOUND", "ECONNREFUSED", "EDNS", "ETLS", "EDECRYPT"]);

function utcDay(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

async function sendQueued(): Promise<number> {
  const accounts = await (await getDb()).emailAccount.findMany({ where: { status: { in: ["CONNECTED", "PENDING"] } } });
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
  const next = await (await getDb()).emailSend.findFirst({
    where: {
      status: "QUEUED",
      OR: [
        { campaign: { status: "SENDING", OR: [{ accountIds: { array_contains: [acc.id] } }, { accountIds: { array_contains: ["*"] } }] } },
        { automation: { status: "ACTIVE", OR: [{ accountIds: { array_contains: [acc.id] } }, { accountIds: { array_contains: ["*"] } }] } },
      ],
    },
    orderBy: { queuedAt: "asc" },
    include: { campaign: true, automation: true, lead: true },
  });
  if (!next) return "none";

  const claimed = await (await getDb()).emailSend.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: { status: "SENDING", accountId: acc.id, claimedAt: new Date() },
  });
  if (claimed.count !== 1) return "skipped";

  const lead = next.lead;
  const skip = async (reason: string) =>
    (await getDb()).emailSend.update({ where: { id: next.id }, data: { status: "SKIPPED", error: reason } }).then(() => "skipped" as const);
  if (!lead || !(lead.email ?? "").includes("@")) return skip("Contact has no email address");
  if (lead.emailOptOut) return skip("Contact unsubscribed");
  if (lead.emailBouncedAt) return skip("Contact's email bounced before");

  let content: { subject: string; html: string; previewText: string; fromName: string; replyTo: string; trackOpens: boolean; trackClicks: boolean; addUnsubscribe: boolean };
  if (next.campaign) {
    const c = next.campaign;
    content = { subject: c.subject, html: c.html, previewText: c.previewText, fromName: c.fromName, replyTo: c.replyTo, trackOpens: c.trackOpens, trackClicks: c.trackClicks, addUnsubscribe: c.addUnsubscribe };
  } else if (next.automation) {
    const node = normalizeFlow(next.automation.flow).nodes.find((n) => n.id === next.nodeId);
    if (!node || node.data.kind !== "email") return skip("Automation step was removed");
    const step = node.data;
    content = { subject: step.subject, html: step.html, previewText: "", fromName: "", replyTo: "", trackOpens: true, trackClicks: true, addUnsubscribe: true };
  } else {
    return skip("Campaign or automation was deleted");
  }

  try {
    const built = await buildEmail(acc, lead, { sendId: next.id, agencyName, ...content });
    await deliver(acc, built);
    const now = new Date();
    await (await getDb()).$transaction([
      (await getDb()).emailSend.update({ where: { id: next.id }, data: { status: "SENT", sentAt: now, messageId: built.messageId, subject: built.subject.slice(0, 500), error: null } }),
      (await getDb()).emailAccount.update({
        where: { id: acc.id },
        data:
          acc.sentDay === utcDay(now)
            ? { sentToday: { increment: 1 }, lastSentAt: now, status: "CONNECTED", lastError: null }
            : { sentToday: 1, sentDay: utcDay(now), lastSentAt: now, status: "CONNECTED", lastError: null },
      }),
      (await getDb()).lead.update({ where: { id: lead.id }, data: { lastEmailedAt: now } }),
    ]);
    acc.sentDay = utcDay(now);
    acc.lastSentAt = now;
    return "sent";
  } catch (e) {
    const err = e as { code?: string; responseCode?: number };
    const message = friendlyMailError(e, acc.smtpHost);
    if (ACCOUNT_LEVEL.has(err.code ?? "") || (err.responseCode ?? 0) === 535 || (err.responseCode ?? 0) === 421) {
      // The mailbox is the problem, not this recipient: put the email back and pause the mailbox.
      await (await getDb()).$transaction([
        (await getDb()).emailSend.update({ where: { id: next.id }, data: { status: "QUEUED", accountId: null, claimedAt: null } }),
        (await getDb()).emailAccount.update({ where: { id: acc.id }, data: { status: "ERROR", lastError: message } }),
      ]);
      return "account-error";
    }
    const hardBounce = (err.responseCode ?? 0) >= 550 && (err.responseCode ?? 0) <= 553;
    await (await getDb()).emailSend.update({
      where: { id: next.id },
      data: { status: "FAILED", error: message, ...(hardBounce ? { bouncedAt: new Date() } : {}) },
    });
    if (hardBounce) await (await getDb()).lead.update({ where: { id: lead.id }, data: { emailBouncedAt: new Date() } });
    return "failed";
  }
}
