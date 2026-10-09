"use server";

// Every email-marketing write. Each action: (1) requires a signed-in manager/super admin,
// (2) validates input with zod, (3) audits anything sensitive.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { audit } from "../audit";
import { AuthError, requireActionUser } from "../session";
import { getBranding } from "../settings";
import { permissionsFor } from "@/lib/access";
import { PIPELINE_STAGES } from "@/lib/constants";
import { isValidEmail, normalizeAudience, normalizeSteps, normalizeTags, SAMPLE_MERGE, type AudienceFilter } from "@/lib/email";
import type { ActionResult } from "../actions";
import type { ContactActivity, ThreadMessage } from "@/lib/email-types";
import { encryptSecret } from "./crypto";
import { buildEmail, deliver, forgetTransport, friendlyMailError, transportFor } from "./mailer";
import { testImap, syncAccount, imapHostFor } from "./imap";
import { checkDomain } from "./dns";
import { audienceWhere, resolveAudience } from "./audience";
import { materializeCampaign, runEmailTick } from "./worker";
import { enrollLeads, fireTrigger } from "./triggers";
import { unsubscribeLead } from "./unsubscribe";
import { loadContactActivity, loadThreadMessages } from "./load";

// ─── Plumbing ────────────────────────────────────────────────

class Forbidden extends Error {}
class Invalid extends Error {}

async function run<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthError || e instanceof Invalid) return { ok: false, error: e.message };
    if (e instanceof Forbidden) return { ok: false, error: e.message || "You don't have access to email marketing." };
    if (e instanceof z.ZodError) return { ok: false, error: "Some of the details aren't valid. Please check and try again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "That already exists." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: "That record no longer exists." };
    console.error(`[email-action:${name}]`, e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function requireEmailUser() {
  const me = await requireActionUser();
  if (!permissionsFor(me.role).emailMarketing) throw new Forbidden();
  return me;
}

const done = () => revalidatePath("/email", "layout");

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const ids = z.array(id).max(50_000);
const str = (max: number) => z.string().max(max);
const html = z.string().max(500_000);
const email = z.string().trim().max(254).refine(isValidEmail, "Invalid email");

// ─── Sending accounts ────────────────────────────────────────

const accountInput = z.object({
  id: id.optional(),
  name: str(120).min(1),
  email,
  fromName: str(120).min(1),
  provider: str(60),
  smtpHost: str(200).min(3),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: str(254).min(1),
  password: str(500), // empty on edit = keep the stored one
  imapEnabled: z.boolean(),
  imapHost: str(200),
  imapPort: z.number().int().min(1).max(65535),
  dailyLimit: z.number().int().min(1).max(5000),
  minDelaySec: z.number().int().min(5).max(3600),
  signature: html,
});

export async function saveEmailAccountAction(input: z.infer<typeof accountInput>) {
  return run("saveEmailAccount", async () => {
    const me = await requireEmailUser();
    const a = accountInput.parse(input);
    const data = {
      name: a.name.trim(),
      email: a.email.toLowerCase(),
      fromName: a.fromName.trim(),
      provider: a.provider,
      smtpHost: a.smtpHost.trim(),
      smtpPort: a.smtpPort,
      smtpSecure: a.smtpPort === 465,
      smtpUser: a.smtpUser.trim(),
      imapEnabled: a.imapEnabled,
      imapHost: a.imapHost.trim(),
      imapPort: a.imapPort,
      imapSecure: a.imapPort !== 143,
      dailyLimit: a.dailyLimit,
      minDelaySec: a.minDelaySec,
      signature: a.signature,
      ...(a.password ? { passwordEnc: encryptSecret(a.password) } : {}),
    };
    let accountId = a.id;
    if (a.id) {
      await prisma.emailAccount.update({ where: { id: a.id }, data: { ...data, status: "PENDING", lastError: null } });
      forgetTransport(a.id);
    } else {
      if (!a.password) throw new Invalid("Enter the mailbox password.");
      const created = await prisma.emailAccount.create({ data: { ...data, passwordEnc: encryptSecret(a.password) } });
      accountId = created.id;
    }
    await audit(me.id, a.id ? "email.account_update" : "email.account_create", "EmailAccount", accountId, { email: data.email });
    // Check the connection straight away so the status is meaningful.
    const test = await testAccount(accountId!);
    done();
    return { id: accountId!, ...test };
  });
}

async function testAccount(accountId: string): Promise<{ smtp: string | null; imap: string | null }> {
  const acc = await prisma.emailAccount.findUniqueOrThrow({ where: { id: accountId } });
  let smtp: string | null = null;
  let imap: string | null = null;
  try {
    forgetTransport(acc.id);
    await transportFor(acc).verify();
  } catch (e) {
    smtp = friendlyMailError(e, acc.smtpHost);
  }
  if (!smtp && acc.imapEnabled) imap = await testImap(acc);
  await prisma.emailAccount.update({
    where: { id: acc.id },
    data: {
      status: smtp ? "ERROR" : "CONNECTED",
      lastError: smtp ? `Sending: ${smtp}` : imap ? `Reading replies (${imapHostFor(acc)}): ${imap}` : null,
    },
  });
  return { smtp, imap };
}

export async function testEmailAccountAction(accountId: string) {
  return run("testEmailAccount", async () => {
    await requireEmailUser();
    const r = await testAccount(id.parse(accountId));
    done();
    return r;
  });
}

export async function setEmailAccountPausedAction(accountId: string, paused: boolean) {
  return run("pauseEmailAccount", async () => {
    await requireEmailUser();
    const aid = id.parse(accountId);
    if (paused) await prisma.emailAccount.update({ where: { id: aid }, data: { status: "DISCONNECTED" } });
    else await testAccount(aid);
    done();
  });
}

export async function deleteEmailAccountAction(accountId: string) {
  return run("deleteEmailAccount", async () => {
    const me = await requireEmailUser();
    const aid = id.parse(accountId);
    const acc = await prisma.emailAccount.delete({ where: { id: aid } });
    forgetTransport(aid);
    await audit(me.id, "email.account_delete", "EmailAccount", aid, { email: acc.email });
    done();
  });
}

/** Send a one-off preview (merge tags filled with sample data) to an address you control. */
export async function sendTestEmailAction(input: { accountId: string; to: string; subject: string; html: string; previewText?: string }) {
  return run("sendTestEmail", async () => {
    await requireEmailUser();
    const p = z.object({ accountId: id, to: email, subject: str(300), html, previewText: str(300).optional() }).parse(input);
    const acc = await prisma.emailAccount.findUnique({ where: { id: p.accountId } });
    if (!acc) throw new Invalid("Choose a sending account first.");
    const branding = await getBranding();
    const built = buildEmail(
      acc,
      { id: "preview", email: p.to, decisionMakerName: SAMPLE_MERGE.decisionMakerName, businessName: SAMPLE_MERGE.businessName, city: SAMPLE_MERGE.city, website: SAMPLE_MERGE.website, service: SAMPLE_MERGE.service },
      { sendId: `test${Date.now().toString(36)}`, subject: `[Test] ${p.subject || "(no subject)"}`, html: p.html, previewText: p.previewText, trackOpens: false, trackClicks: false, addUnsubscribe: false, agencyName: branding.agencyName || branding.appName }
    );
    try {
      await deliver(acc, built);
    } catch (e) {
      throw new Invalid(friendlyMailError(e, acc.smtpHost));
    }
  });
}

// ─── Domains ─────────────────────────────────────────────────

const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/^.*@/, ""))
  .refine((d) => /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/.test(d), "Enter a domain like example.com");

async function runDomainCheck(domainId: string) {
  const d = await prisma.emailDomain.findUniqueOrThrow({ where: { id: domainId } });
  const acc = await prisma.emailAccount.findFirst({ where: { email: { endsWith: `@${d.domain}` } }, select: { smtpHost: true } });
  const r = await checkDomain(d.domain, acc?.smtpHost);
  await prisma.emailDomain.update({
    where: { id: d.id },
    data: { spfStatus: r.spf, dkimStatus: r.dkim, dmarcStatus: r.dmarc, details: r.details as Prisma.InputJsonValue, lastCheckedAt: new Date() },
  });
}

export async function addDomainAction(domain: string) {
  return run("addDomain", async () => {
    await requireEmailUser();
    const d = await prisma.emailDomain.create({ data: { domain: domainName.parse(domain) } });
    await runDomainCheck(d.id);
    done();
  });
}

export async function checkDomainAction(domainId: string) {
  return run("checkDomain", async () => {
    await requireEmailUser();
    await runDomainCheck(id.parse(domainId));
    done();
  });
}

export async function deleteDomainAction(domainId: string) {
  return run("deleteDomain", async () => {
    await requireEmailUser();
    await prisma.emailDomain.delete({ where: { id: id.parse(domainId) } });
    done();
  });
}

// ─── Templates ───────────────────────────────────────────────

export async function saveTemplateAction(input: { id?: string; name: string; subject: string; html: string }) {
  return run("saveTemplate", async () => {
    await requireEmailUser();
    const t = z.object({ id: id.optional(), name: str(120).min(1), subject: str(300), html }).parse(input);
    const data = { name: t.name.trim(), subject: t.subject, html: t.html };
    const saved = t.id ? await prisma.emailTemplate.update({ where: { id: t.id }, data }) : await prisma.emailTemplate.create({ data });
    done();
    return { id: saved.id };
  });
}

export async function deleteTemplateAction(templateId: string) {
  return run("deleteTemplate", async () => {
    await requireEmailUser();
    await prisma.emailTemplate.delete({ where: { id: id.parse(templateId) } });
    done();
  });
}

// ─── Campaigns ───────────────────────────────────────────────

const audienceInput = z.object({
  leadIds: ids,
  stages: z.array(z.enum(PIPELINE_STAGES as unknown as [string, ...string[]])).max(20),
  temperatures: z.array(z.enum(["COLD", "WARM", "HOT"])).max(3),
  services: z.array(str(60)).max(20),
  tags: z.array(str(40)).max(50),
  poolIds: z.array(id).max(100),
  sources: z.array(str(120)).max(100),
  cities: z.array(str(120)).max(200),
  assignedToIds: z.array(id).max(100),
  excludeEmailedWithinDays: z.number().int().min(0).max(365),
});

const campaignInput = z.object({
  id: id.optional(),
  name: str(160).min(1),
  subject: str(300),
  previewText: str(300),
  html,
  fromName: str(120),
  replyTo: z.union([z.literal(""), email]),
  accountIds: z.array(id).max(50),
  audience: audienceInput,
  trackOpens: z.boolean(),
  trackClicks: z.boolean(),
  addUnsubscribe: z.boolean(),
});

export async function saveCampaignAction(input: z.infer<typeof campaignInput>) {
  return run("saveCampaign", async () => {
    const me = await requireEmailUser();
    const c = campaignInput.parse(input);
    const data = {
      name: c.name.trim(),
      subject: c.subject,
      previewText: c.previewText,
      html: c.html,
      fromName: c.fromName.trim(),
      replyTo: c.replyTo,
      accountIds: c.accountIds,
      audience: normalizeAudience(c.audience) as unknown as Prisma.InputJsonValue,
      trackOpens: c.trackOpens,
      trackClicks: c.trackClicks,
      addUnsubscribe: c.addUnsubscribe,
    };
    if (c.id) {
      const existing = await prisma.campaign.findUnique({ where: { id: c.id }, select: { status: true } });
      if (!existing) throw new Invalid("That campaign no longer exists.");
      if (existing.status !== "DRAFT" && existing.status !== "SCHEDULED") throw new Invalid("A campaign can't be edited once it has started sending.");
      await prisma.campaign.update({ where: { id: c.id }, data });
      done();
      return { id: c.id };
    }
    const created = await prisma.campaign.create({ data: { ...data, createdById: me.id } });
    done();
    return { id: created.id };
  });
}

export async function previewAudienceAction(filter: AudienceFilter) {
  return run("previewAudience", async () => {
    await requireEmailUser();
    const a = normalizeAudience(audienceInput.parse(filter));
    const [leads, sample] = await Promise.all([
      resolveAudience(a),
      prisma.lead.findMany({ where: await audienceWhere(a), take: 6, select: { businessName: true, email: true }, orderBy: { createdAt: "asc" } }),
    ]);
    return { count: leads.length, sample: sample.map((s) => ({ businessName: s.businessName, email: s.email ?? "" })) };
  });
}

async function assertReady(campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Invalid("That campaign no longer exists.");
  if (!c.subject.trim()) throw new Invalid("Add a subject line first.");
  if (c.html.replace(/<[^>]+>/g, "").trim().length < 2) throw new Invalid("The email body is empty.");
  const accountIds = z.array(id).parse(c.accountIds);
  const usable = await prisma.emailAccount.count({ where: { id: { in: accountIds }, status: { in: ["CONNECTED", "PENDING"] } } });
  if (!usable) throw new Invalid("Choose at least one connected sending account.");
  if ((await resolveAudience(normalizeAudience(c.audience))).length === 0) throw new Invalid("No subscribed contacts match this audience.");
  return c;
}

/** Send now (scheduledAt null) or schedule for later. */
export async function launchCampaignAction(campaignId: string, scheduledAt: string | null) {
  return run("launchCampaign", async () => {
    const me = await requireEmailUser();
    const cid = id.parse(campaignId);
    const when = scheduledAt ? new Date(z.string().datetime({ offset: true }).parse(scheduledAt)) : null;
    const c = await assertReady(cid);
    if (c.status !== "DRAFT" && c.status !== "SCHEDULED") throw new Invalid("This campaign has already been sent.");
    if (when && when.getTime() > Date.now() + 60_000) {
      await prisma.campaign.update({ where: { id: cid }, data: { status: "SCHEDULED", scheduledAt: when } });
      await audit(me.id, "email.campaign_schedule", "Campaign", cid, { at: when.toISOString() });
      done();
      return { recipients: null };
    }
    const claimed = await prisma.campaign.updateMany({
      where: { id: cid, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "SENDING", startedAt: new Date(), scheduledAt: null },
    });
    if (claimed.count !== 1) throw new Invalid("This campaign is already sending.");
    const recipients = await materializeCampaign(cid);
    await audit(me.id, "email.campaign_send", "Campaign", cid, { recipients });
    void runEmailTick();
    done();
    return { recipients };
  });
}

export async function setCampaignStatusAction(campaignId: string, action: "pause" | "resume" | "cancel" | "unschedule") {
  return run("campaignStatus", async () => {
    const me = await requireEmailUser();
    const cid = id.parse(campaignId);
    const a = z.enum(["pause", "resume", "cancel", "unschedule"]).parse(action);
    const moves = {
      pause: { from: ["SENDING"], to: "PAUSED" },
      resume: { from: ["PAUSED"], to: "SENDING" },
      cancel: { from: ["SENDING", "PAUSED", "SCHEDULED"], to: "CANCELLED" },
      unschedule: { from: ["SCHEDULED"], to: "DRAFT" },
    } as const;
    const m = moves[a];
    const res = await prisma.campaign.updateMany({
      where: { id: cid, status: { in: [...m.from] } },
      data: { status: m.to, ...(a === "cancel" ? { finishedAt: new Date() } : {}), ...(a === "unschedule" ? { scheduledAt: null } : {}) },
    });
    if (res.count !== 1) throw new Invalid("The campaign's status changed — refresh and try again.");
    if (a === "cancel") await prisma.emailSend.updateMany({ where: { campaignId: cid, status: "QUEUED" }, data: { status: "SKIPPED", error: "Campaign cancelled" } });
    await audit(me.id, `email.campaign_${a}`, "Campaign", cid);
    if (a === "resume") void runEmailTick();
    done();
  });
}

export async function duplicateCampaignAction(campaignId: string) {
  return run("duplicateCampaign", async () => {
    const me = await requireEmailUser();
    const c = await prisma.campaign.findUnique({ where: { id: id.parse(campaignId) } });
    if (!c) throw new Invalid("That campaign no longer exists.");
    const copy = await prisma.campaign.create({
      data: {
        name: `${c.name} (copy)`.slice(0, 160),
        subject: c.subject,
        previewText: c.previewText,
        html: c.html,
        fromName: c.fromName,
        replyTo: c.replyTo,
        accountIds: c.accountIds as Prisma.InputJsonValue,
        audience: c.audience as Prisma.InputJsonValue,
        trackOpens: c.trackOpens,
        trackClicks: c.trackClicks,
        addUnsubscribe: c.addUnsubscribe,
        createdById: me.id,
      },
    });
    done();
    return { id: copy.id };
  });
}

export async function deleteCampaignAction(campaignId: string) {
  return run("deleteCampaign", async () => {
    const me = await requireEmailUser();
    const cid = id.parse(campaignId);
    const c = await prisma.campaign.findUnique({ where: { id: cid }, select: { status: true, name: true } });
    if (!c) return;
    if (c.status === "SENDING") throw new Invalid("Pause or cancel the campaign before deleting it.");
    await prisma.campaign.delete({ where: { id: cid } });
    await audit(me.id, "email.campaign_delete", "Campaign", cid, { name: c.name });
    done();
  });
}

// ─── Automations ─────────────────────────────────────────────

const stepInput = z.discriminatedUnion("type", [
  z.object({ id: str(40), type: z.literal("email"), subject: str(300), html }),
  z.object({ id: str(40), type: z.literal("wait"), amount: z.number().int().min(1).max(365), unit: z.enum(["minutes", "hours", "days"]) }),
]);

const automationInput = z.object({
  id: id.optional(),
  name: str(160).min(1),
  trigger: z.enum(["MANUAL", "LEAD_CREATED", "STAGE_CHANGED", "TAG_ADDED"]),
  triggerValue: str(60),
  steps: z.array(stepInput).max(30),
  accountIds: z.array(id).max(50),
  stopOnReply: z.boolean(),
});

export async function saveAutomationAction(input: z.infer<typeof automationInput>) {
  return run("saveAutomation", async () => {
    await requireEmailUser();
    const a = automationInput.parse(input);
    if (a.trigger === "STAGE_CHANGED" && !(PIPELINE_STAGES as readonly string[]).includes(a.triggerValue)) throw new Invalid("Choose the pipeline stage that starts this automation.");
    if (a.trigger === "TAG_ADDED" && !a.triggerValue.trim()) throw new Invalid("Enter the tag that starts this automation.");
    const data = {
      name: a.name.trim(),
      trigger: a.trigger,
      triggerValue: a.trigger === "STAGE_CHANGED" || a.trigger === "TAG_ADDED" ? a.triggerValue.trim() : "",
      steps: normalizeSteps(a.steps) as unknown as Prisma.InputJsonValue,
      accountIds: a.accountIds,
      stopOnReply: a.stopOnReply,
    };
    const saved = a.id ? await prisma.automation.update({ where: { id: a.id }, data }) : await prisma.automation.create({ data });
    done();
    return { id: saved.id };
  });
}

export async function setAutomationStatusAction(automationId: string, status: "ACTIVE" | "PAUSED") {
  return run("automationStatus", async () => {
    const me = await requireEmailUser();
    const aid = id.parse(automationId);
    const s = z.enum(["ACTIVE", "PAUSED"]).parse(status);
    if (s === "ACTIVE") {
      const a = await prisma.automation.findUniqueOrThrow({ where: { id: aid } });
      const steps = normalizeSteps(a.steps);
      if (!steps.some((x) => x.type === "email")) throw new Invalid("Add at least one email step first.");
      if (steps.some((x) => x.type === "email" && (!x.subject.trim() || x.html.replace(/<[^>]+>/g, "").trim().length < 2)))
        throw new Invalid("Every email step needs a subject and a message.");
      const accountIds = z.array(id).parse(a.accountIds);
      if (!(await prisma.emailAccount.count({ where: { id: { in: accountIds } } }))) throw new Invalid("Choose at least one sending account.");
    }
    await prisma.automation.update({ where: { id: aid }, data: { status: s } });
    await audit(me.id, `email.automation_${s.toLowerCase()}`, "Automation", aid);
    done();
  });
}

export async function deleteAutomationAction(automationId: string) {
  return run("deleteAutomation", async () => {
    const me = await requireEmailUser();
    const aid = id.parse(automationId);
    await prisma.automation.delete({ where: { id: aid } });
    await audit(me.id, "email.automation_delete", "Automation", aid);
    done();
  });
}

export async function enrollContactsAction(automationId: string, leadIds: string[]) {
  return run("enrollContacts", async () => {
    await requireEmailUser();
    const aid = id.parse(automationId);
    const list = ids.min(1).parse(leadIds);
    const mailable = await prisma.lead.findMany({
      where: { id: { in: list }, email: { contains: "@" }, emailOptOut: false, emailBouncedAt: null },
      select: { id: true },
    });
    const count = await enrollLeads(aid, mailable.map((l) => l.id));
    done();
    return { enrolled: count, skipped: list.length - count };
  });
}

export async function stopEnrollmentAction(enrollmentId: string) {
  return run("stopEnrollment", async () => {
    await requireEmailUser();
    await prisma.automationEnrollment.updateMany({
      where: { id: id.parse(enrollmentId), status: "ACTIVE" },
      data: { status: "STOPPED", stopReason: "Stopped by hand", finishedAt: new Date(), nextRunAt: null },
    });
    done();
  });
}

// ─── Contacts ────────────────────────────────────────────────

export async function updateContactTagsAction(leadIds: string[], add: string[], remove: string[]) {
  return run("updateContactTags", async () => {
    await requireEmailUser();
    const list = ids.min(1).max(5000).parse(leadIds);
    const addTags = normalizeTags(z.array(str(40)).max(20).parse(add));
    const removeTags = new Set(normalizeTags(z.array(str(40)).max(20).parse(remove)));
    const leads = await prisma.lead.findMany({ where: { id: { in: list } }, select: { id: true, tags: true } });
    const newlyTagged = new Map<string, string[]>();
    for (const l of leads) {
      const current = normalizeTags(l.tags);
      const next = normalizeTags([...current.filter((t) => !removeTags.has(t)), ...addTags]);
      for (const t of addTags) if (!current.includes(t)) newlyTagged.set(t, [...(newlyTagged.get(t) ?? []), l.id]);
      if (next.join("|") !== current.join("|")) await prisma.lead.update({ where: { id: l.id }, data: { tags: next } });
    }
    for (const [tag, tagged] of newlyTagged) await fireTrigger("TAG_ADDED", tagged, tag);
    done();
  });
}

export async function setSubscriptionAction(leadIds: string[], subscribed: boolean) {
  return run("setSubscription", async () => {
    const me = await requireEmailUser();
    const list = ids.min(1).max(5000).parse(leadIds);
    if (subscribed) {
      await prisma.lead.updateMany({ where: { id: { in: list } }, data: { emailOptOut: false, unsubscribedAt: null, emailBouncedAt: null } });
    } else {
      for (const l of list) await unsubscribeLead(l);
    }
    await audit(me.id, subscribed ? "email.resubscribe" : "email.unsubscribe", "Lead", undefined, { count: list.length });
    done();
  });
}

export async function getContactActivityAction(leadId: string): Promise<ActionResult<ContactActivity>> {
  return run("contactActivity", async () => {
    await requireEmailUser();
    return loadContactActivity(id.parse(leadId));
  });
}

/** Leads by id → minimal info, for the "add to automation" picker. */
export async function searchContactsAction(q: string) {
  return run("searchContacts", async () => {
    await requireEmailUser();
    const term = str(100).parse(q).trim();
    const rows = await prisma.lead.findMany({
      where: {
        email: { contains: "@" },
        emailOptOut: false,
        emailBouncedAt: null,
        ...(term ? { OR: [{ businessName: { contains: term } }, { email: { contains: term } }, { decisionMakerName: { contains: term } }] } : {}),
      },
      take: 20,
      orderBy: { businessName: "asc" },
      select: { id: true, businessName: true, email: true, decisionMakerName: true },
    });
    return rows.map((r) => ({ id: r.id, businessName: r.businessName, email: r.email ?? "", contactName: r.decisionMakerName ?? "" }));
  });
}

// ─── Inbox ───────────────────────────────────────────────────

export async function getThreadAction(threadId: string): Promise<ActionResult<ThreadMessage[]>> {
  return run("getThread", async () => {
    await requireEmailUser();
    const tid = id.parse(threadId);
    const messages = await loadThreadMessages(tid);
    await prisma.inboxThread.updateMany({ where: { id: tid, unread: true }, data: { unread: false } });
    return messages;
  });
}

export async function updateThreadAction(threadId: string, patch: { unread?: boolean; archived?: boolean }) {
  return run("updateThread", async () => {
    await requireEmailUser();
    const p = z.object({ unread: z.boolean().optional(), archived: z.boolean().optional() }).parse(patch);
    await prisma.inboxThread.update({ where: { id: id.parse(threadId) }, data: p });
    done();
  });
}

const plainToHtml = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");

export async function replyThreadAction(threadId: string, body: string) {
  return run("replyThread", async () => {
    const me = await requireEmailUser();
    const tid = id.parse(threadId);
    const text = str(50_000).min(1).parse(body).trim();
    const thread = await prisma.inboxThread.findUnique({
      where: { id: tid },
      include: { account: true, messages: { orderBy: { sentAt: "desc" }, take: 20 } },
    });
    if (!thread) throw new Invalid("That conversation no longer exists.");
    const acc = thread.account;
    const lastIn = thread.messages.find((m) => m.direction === "IN");
    const refs = [...new Set([...(lastIn?.references ?? "").split(/\s+/).filter(Boolean), lastIn?.messageId].filter(Boolean))] as string[];
    const domain = acc.email.split("@")[1] || "localhost";
    const messageId = `<r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@${domain}>`;
    const subject = /^re:/i.test(lastIn?.subject ?? "") ? lastIn!.subject : `Re: ${thread.subject}`;
    const sig = acc.signature.trim() ? `<div style="margin-top:16px">${acc.signature}</div>` : "";
    try {
      await transportFor(acc).sendMail({
        from: `"${acc.fromName.replace(/"/g, "")}" <${acc.email}>`,
        to: thread.contactEmail,
        subject,
        text: text + (acc.signature.trim() ? `\n\n${acc.signature.replace(/<[^>]+>/g, "")}` : ""),
        html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6">${plainToHtml(text)}${sig}</div>`,
        messageId,
        inReplyTo: lastIn ? `<${lastIn.messageId}>` : undefined,
        references: refs.map((r) => `<${r}>`).join(" ") || undefined,
      });
    } catch (e) {
      throw new Invalid(friendlyMailError(e, acc.smtpHost));
    }
    const now = new Date();
    await prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        accountId: acc.id,
        messageId: messageId.replace(/^<|>$/g, ""),
        inReplyTo: lastIn?.messageId ?? null,
        direction: "OUT",
        fromEmail: acc.email,
        fromName: acc.fromName,
        toEmail: thread.contactEmail,
        subject,
        text,
        sentAt: now,
      },
    });
    await prisma.inboxThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, unread: false } });
    if (thread.leadId) await prisma.lead.update({ where: { id: thread.leadId }, data: { lastContactedAt: now } }).catch(() => {});
    await audit(me.id, "email.reply", "InboxThread", thread.id);
    done();
  });
}

export async function syncInboxNowAction() {
  return run("syncInbox", async () => {
    await requireEmailUser();
    const accounts = await prisma.emailAccount.findMany({ where: { imapEnabled: true, status: "CONNECTED" } });
    let added = 0;
    const errors: string[] = [];
    for (const acc of accounts) {
      try {
        added += await syncAccount(acc);
      } catch (e) {
        errors.push(`${acc.email}: ${friendlyMailError(e, imapHostFor(acc))}`);
      }
    }
    done();
    return { added, errors, accounts: accounts.length };
  });
}

/** Managers can nudge the queue instead of waiting for the next tick. */
export async function processQueueNowAction() {
  return run("processQueue", async () => {
    await requireEmailUser();
    const r = await runEmailTick();
    done();
    return r;
  });
}

