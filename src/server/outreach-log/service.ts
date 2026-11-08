// Outreach & Jobs log — server logic shared by the UI (server actions), the MCP agent
// endpoint and the follow-up signal cron. Separate from the cold-calling CRM's Lead model.

import type { JobApplication, LogContact, PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { visibleUserIds } from "../session";
import {
  CONTACT_STAGES,
  JOB_STAGES,
  isChannel,
  type ContactEvent,
  type ContactStage,
  type JobEvent,
  type JobStage,
} from "@/lib/outreach-log/constants";
import {
  applyContactEvent,
  applyContactStage,
  applyJobEvent,
  applyJobStage,
  awaitingUs,
  expireContact,
  expireJob,
  handleKey,
  type TrackState,
} from "@/lib/outreach-log/rules";
import { todayKey, zonedISO } from "@/lib/date";
import type { User } from "@/lib/types";

export class LogError extends Error {}

type Db = PrismaClient;
type Opts = { byAgent?: boolean };
const db = () => getDb();
const isManager = (u: User) => u.role === "MANAGER" || u.role === "SUPER_ADMIN";
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const startOfToday = () => new Date(zonedISO(todayKey(), 0));

async function ownerScope(me: User): Promise<{ ownerId?: { in: string[] } }> {
  const ids = await visibleUserIds(me);
  return ids ? { ownerId: { in: [...ids] } } : {};
}

const track = (r: { stage: string; followupCount: number; lastOutboundAt: Date | null; lastInboundAt: Date | null; nextFollowupAt: Date | null }): TrackState => ({
  stage: r.stage,
  followupCount: r.followupCount,
  lastOutboundAt: r.lastOutboundAt,
  lastInboundAt: r.lastInboundAt,
  nextFollowupAt: r.nextFollowupAt,
});

/** Any change to the follow-up date re-arms the agent signal. */
const trackData = (s: TrackState, prev: TrackState) => ({
  ...s,
  ...(s.nextFollowupAt?.getTime() !== prev.nextFollowupAt?.getTime() ? { signaledAt: null } : {}),
});

// ─── Accounts (your sending identities: 2–3 WhatsApps, Facebooks, inboxes…) ───

export async function listAccounts(me: User) {
  return (await db()).logAccount.findMany({ where: isManager(me) ? {} : { ownerId: me.id }, orderBy: [{ channel: "asc" }, { label: "asc" }] });
}

export async function saveAccount(me: User, input: { id?: string; channel: string; label: string; handle?: string; dailyLimit?: number; active?: boolean }) {
  if (!isChannel(input.channel)) throw new LogError("Pick a channel.");
  const label = clip(input.label, 120);
  if (!label) throw new LogError("Give the account a name, e.g. “WhatsApp — work phone”.");
  const data = { channel: input.channel, label, handle: clip(input.handle, 255), dailyLimit: Math.max(0, Math.min(10000, Math.round(input.dailyLimit ?? 0))), active: input.active ?? true };
  const d = await db();
  if (input.id) {
    const row = await d.logAccount.findFirst({ where: { id: input.id } });
    if (!row || (!isManager(me) && row.ownerId !== me.id)) throw new LogError("Account not found.");
    return d.logAccount.update({ where: { id: input.id }, data });
  }
  return d.logAccount.create({ data: { ...data, ownerId: me.id } });
}

export async function deleteAccount(me: User, id: string) {
  const d = await db();
  const row = await d.logAccount.findFirst({ where: { id } });
  if (!row || (!isManager(me) && row.ownerId !== me.id)) throw new LogError("Account not found.");
  await d.logAccount.delete({ where: { id } });
}

async function checkAccount(d: Db, me: User, accountId: string | null | undefined, channel?: string) {
  if (!accountId) return null;
  const acc = await d.logAccount.findFirst({ where: { id: accountId } });
  if (!acc || (!isManager(me) && acc.ownerId !== me.id)) throw new LogError("That sending account doesn't exist.");
  if (channel && acc.channel !== channel) throw new LogError(`“${acc.label}” is a ${acc.channel} account, not ${channel}.`);
  return acc;
}

/** Outbound sends today per account, with the account's limit. */
export async function sendCounts(me: User) {
  const d = await db();
  const accounts = await listAccounts(me);
  const since = startOfToday();
  const rows = await Promise.all(
    accounts.map(async (a) => ({
      accountId: a.id,
      sent: await d.logActivity.count({ where: { accountId: a.id, direction: "outbound", occurredAt: { gte: since } } }),
      limit: a.dailyLimit,
    }))
  );
  return rows;
}

async function limitWarning(d: Db, accountId: string | null): Promise<string | null> {
  if (!accountId) return null;
  const acc = await d.logAccount.findFirst({ where: { id: accountId } });
  if (!acc?.dailyLimit) return null;
  const sent = await d.logActivity.count({ where: { accountId, direction: "outbound", occurredAt: { gte: startOfToday() } } });
  if (sent >= acc.dailyLimit) return `“${acc.label}” has hit its daily limit (${sent}/${acc.dailyLimit}). Switch to another account or stop for today.`;
  if (sent >= acc.dailyLimit * 0.8) return `“${acc.label}” is at ${sent}/${acc.dailyLimit} sends today.`;
  return null;
}

// ─── Campaigns / pools (keep e.g. "Free website offer" separate) ───

export async function listCampaigns() {
  return (await db()).logCampaign.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export async function saveCampaign(me: User, input: { id?: string; name: string; color?: string; description?: string; active?: boolean }) {
  const name = clip(input.name, 120);
  if (!name) throw new LogError("Name the campaign, e.g. “Free website offer”.");
  const d = await db();
  const clash = await d.logCampaign.findFirst({ where: { name } });
  if (clash && clash.id !== input.id) throw new LogError(`A campaign called “${name}” already exists.`);
  const data = { name, color: input.color && HEX.test(input.color) ? input.color : "#EA8B5E", description: clip(input.description, 500), active: input.active ?? true };
  if (input.id) {
    if (!(await d.logCampaign.findFirst({ where: { id: input.id } }))) throw new LogError("Campaign not found.");
    return d.logCampaign.update({ where: { id: input.id }, data });
  }
  return d.logCampaign.create({ data: { ...data, ownerId: me.id } });
}

export async function deleteCampaign(id: string) {
  const d = await db();
  if (!(await d.logCampaign.findFirst({ where: { id } }))) throw new LogError("Campaign not found.");
  // Contacts stay; they just leave the campaign (FK is SET NULL).
  await d.logCampaign.delete({ where: { id } });
}

/** By id or name (case-insensitive). With `create`, an unknown name becomes a new campaign. */
export async function resolveCampaign(me: User, ref: string | null | undefined, create = false) {
  if (!ref) return null;
  const all = await listCampaigns();
  const r = ref.trim().toLowerCase();
  const hit = all.find((c) => c.id === ref) ?? all.find((c) => c.name.toLowerCase() === r);
  if (hit) return hit.id;
  if (!create) throw new LogError(`No campaign “${ref}”.`);
  return (await saveCampaign(me, { name: ref })).id;
}

async function checkCampaign(d: Db, campaignId: string | null | undefined) {
  if (!campaignId) return;
  if (!(await d.logCampaign.findFirst({ where: { id: campaignId } }))) throw new LogError("That campaign doesn't exist.");
}

/** "Shopify, US , hot" -> "shopify, us, hot" (deduped, max 500 chars). */
export const normalizeTags = (v: unknown) =>
  clip([...new Set((typeof v === "string" ? v : "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].join(", "), 500);

// ─── Outreach contacts ───────────────────────────────────────

export type ContactInput = {
  name: string;
  channel: string;
  handle?: string;
  company?: string;
  title?: string;
  accountId?: string | null;
  source?: string;
  notes?: string;
  campaignId?: string | null;
  tags?: string;
};

export async function findContactByHandle(channel: string, handle: string) {
  const key = handleKey(channel, handle);
  if (!key) return null;
  return (await db()).logContact.findFirst({ where: { channel, handleKey: key } });
}

export async function createContact(me: User, input: ContactInput, opts: Opts & { reuse?: boolean } = {}) {
  if (!isChannel(input.channel)) throw new LogError("Pick a channel.");
  const d = await db();
  const name = clip(input.name, 200) || clip(input.handle, 200);
  if (!name) throw new LogError("Add a name or a handle.");
  const handle = clip(input.handle, 500);
  const key = handleKey(input.channel, handle);
  if (key) {
    const dup = await d.logContact.findFirst({ where: { channel: input.channel, handleKey: key } });
    if (dup) {
      if (opts.reuse) return dup;
      throw new LogError(`Already logged: ${dup.name} on ${input.channel}.`);
    }
  }
  await checkAccount(d, me, input.accountId, input.channel);
  await checkCampaign(d, input.campaignId);
  const row = await d.logContact.create({
    data: {
      ownerId: me.id,
      name,
      channel: input.channel,
      handle,
      handleKey: key,
      company: clip(input.company, 200),
      title: clip(input.title, 200),
      accountId: input.accountId || null,
      source: clip(input.source, 120),
      notes: clip(input.notes, 10000) || null,
      campaignId: input.campaignId || null,
      tags: normalizeTags(input.tags),
    },
  });
  return row;
}

async function getContact(d: Db, me: User, id: string) {
  const row = await d.logContact.findFirst({ where: { id, ...(await ownerScope(me)) } });
  if (!row) throw new LogError("Contact not found.");
  return row;
}

export async function updateContact(me: User, id: string, input: Partial<ContactInput>) {
  const d = await db();
  const row = await getContact(d, me, id);
  const channel = input.channel && isChannel(input.channel) ? input.channel : row.channel;
  const handle = input.handle !== undefined ? clip(input.handle, 500) : row.handle;
  if (input.accountId) await checkAccount(d, me, input.accountId, channel);
  if (input.campaignId) await checkCampaign(d, input.campaignId);
  return d.logContact.update({
    where: { id },
    data: {
      channel,
      handle,
      handleKey: handleKey(channel, handle),
      ...(input.name !== undefined && { name: clip(input.name, 200) || row.name }),
      ...(input.company !== undefined && { company: clip(input.company, 200) }),
      ...(input.title !== undefined && { title: clip(input.title, 200) }),
      ...(input.source !== undefined && { source: clip(input.source, 120) }),
      ...(input.notes !== undefined && { notes: clip(input.notes, 10000) || null }),
      ...(input.accountId !== undefined && { accountId: input.accountId || null }),
      ...(input.campaignId !== undefined && { campaignId: input.campaignId || null }),
      ...(input.tags !== undefined && { tags: normalizeTags(input.tags) }),
    },
  });
}

export async function deleteContact(me: User, id: string) {
  const d = await db();
  await getContact(d, me, id);
  await d.logContact.delete({ where: { id } });
}

export async function logContactEvent(
  me: User,
  id: string,
  ev: ContactEvent,
  input: { text?: string; accountId?: string | null; at?: Date } = {},
  opts: Opts = {}
) {
  const d = await db();
  const row = await getContact(d, me, id);
  const at = input.at && !isNaN(input.at.getTime()) ? input.at : new Date();
  const accountId = input.accountId === undefined ? row.accountId : input.accountId;
  if (accountId) await checkAccount(d, me, accountId, row.channel);
  const prev = track(row);
  const next = applyContactEvent(prev, ev, at);
  const outbound = ev === "sent" || ev === "followup";
  await d.logActivity.create({
    data: {
      userId: me.id,
      contactId: id,
      accountId: accountId || null,
      type: ev,
      direction: outbound ? "outbound" : ev === "reply" ? "inbound" : "none",
      text: clip(input.text, 10000) || null,
      fromStage: prev.stage !== next.stage ? prev.stage : null,
      toStage: prev.stage !== next.stage ? next.stage : null,
      byAgent: !!opts.byAgent,
      occurredAt: at,
    },
  });
  const updated = await d.logContact.update({
    where: { id },
    data: { ...trackData(next, prev), ...(outbound && accountId && !row.accountId ? { accountId } : {}) },
  });
  return { contact: updated, warning: outbound ? await limitWarning(d, accountId) : null };
}

export async function setContactStage(me: User, id: string, stage: ContactStage, input: { note?: string; meetingAt?: Date | null } = {}, opts: Opts = {}) {
  if (!CONTACT_STAGES.includes(stage)) throw new LogError("Unknown stage.");
  const d = await db();
  const row = await getContact(d, me, id);
  const prev = track(row);
  const next = applyContactStage(prev, stage, new Date(), input.meetingAt);
  await d.logActivity.create({
    data: { userId: me.id, contactId: id, type: "stage", fromStage: prev.stage, toStage: stage, text: clip(input.note, 4000) || null, byAgent: !!opts.byAgent },
  });
  return d.logContact.update({ where: { id }, data: trackData(next, prev) });
}

export async function setContactFollowup(me: User, id: string, when: Date | null) {
  const d = await db();
  await getContact(d, me, id);
  return d.logContact.update({ where: { id }, data: { nextFollowupAt: when, signaledAt: null } });
}

// ─── Job applications ────────────────────────────────────────

export type JobInput = {
  title: string;
  company?: string;
  source: string;
  url?: string;
  location?: string;
  salary?: string;
  accountId?: string | null;
  contactName?: string;
  contactInfo?: string;
  notes?: string;
  stage?: "saved" | "applied";
  appliedAt?: Date;
};

export async function findJobByUrl(url: string) {
  const u = clip(url, 1000);
  if (!u) return null;
  return (await db()).jobApplication.findFirst({ where: { url: u } });
}

export async function createJob(me: User, input: JobInput, opts: Opts & { reuse?: boolean } = {}) {
  const d = await db();
  const title = clip(input.title, 200);
  if (!title) throw new LogError("Add the job title.");
  const url = clip(input.url, 1000);
  if (url) {
    const dup = await d.jobApplication.findFirst({ where: { url } });
    if (dup) {
      if (opts.reuse) return dup;
      throw new LogError(`Already logged: ${dup.title}${dup.company ? ` at ${dup.company}` : ""}.`);
    }
  }
  await checkAccount(d, me, input.accountId);
  const job = await d.jobApplication.create({
    data: {
      ownerId: me.id,
      title,
      company: clip(input.company, 200),
      source: clip(input.source, 40) || "other",
      url,
      location: clip(input.location, 200),
      salary: clip(input.salary, 120),
      accountId: input.accountId || null,
      contactName: clip(input.contactName, 200),
      contactInfo: clip(input.contactInfo, 255),
      notes: clip(input.notes, 10000) || null,
      stage: "saved",
    },
  });
  if ((input.stage ?? "applied") === "applied") return (await logJobEvent(me, job.id, "applied", { at: input.appliedAt, accountId: input.accountId }, opts)).job;
  return job;
}

async function getJob(d: Db, me: User, id: string) {
  const row = await d.jobApplication.findFirst({ where: { id, ...(await ownerScope(me)) } });
  if (!row) throw new LogError("Job application not found.");
  return row;
}

export async function updateJob(me: User, id: string, input: Partial<JobInput>) {
  const d = await db();
  await getJob(d, me, id);
  if (input.accountId) await checkAccount(d, me, input.accountId);
  const s = (k: keyof JobInput, n: number) => (input[k] !== undefined ? { [k]: clip(input[k], n) } : {});
  return d.jobApplication.update({
    where: { id },
    data: {
      ...s("title", 200),
      ...s("company", 200),
      ...s("source", 40),
      ...s("url", 1000),
      ...s("location", 200),
      ...s("salary", 120),
      ...s("contactName", 200),
      ...s("contactInfo", 255),
      ...(input.notes !== undefined && { notes: clip(input.notes, 10000) || null }),
      ...(input.accountId !== undefined && { accountId: input.accountId || null }),
    },
  });
}

export async function deleteJob(me: User, id: string) {
  const d = await db();
  await getJob(d, me, id);
  await d.jobApplication.delete({ where: { id } });
}

export async function logJobEvent(
  me: User,
  id: string,
  ev: JobEvent,
  input: { text?: string; accountId?: string | null; at?: Date; interviewAt?: Date | null } = {},
  opts: Opts = {}
) {
  const d = await db();
  const row = await getJob(d, me, id);
  const at = input.at && !isNaN(input.at.getTime()) ? input.at : new Date();
  const accountId = input.accountId === undefined ? row.accountId : input.accountId;
  const prev = track(row);
  const next = applyJobEvent(prev, ev, at, { interviewAt: input.interviewAt });
  const outbound = ev === "applied" || ev === "followup";
  await d.logActivity.create({
    data: {
      userId: me.id,
      jobId: id,
      accountId: accountId || null,
      type: ev,
      direction: outbound ? "outbound" : ev === "note" ? "none" : "inbound",
      text: clip(input.text, 10000) || null,
      fromStage: prev.stage !== next.stage ? prev.stage : null,
      toStage: prev.stage !== next.stage ? next.stage : null,
      byAgent: !!opts.byAgent,
      occurredAt: at,
    },
  });
  const job = await d.jobApplication.update({
    where: { id },
    data: {
      ...trackData(next, prev),
      ...(ev === "applied" && !row.appliedAt ? { appliedAt: at } : {}),
      ...(ev === "interview" && input.interviewAt ? { interviewAt: input.interviewAt } : {}),
    },
  });
  return { job, warning: outbound ? await limitWarning(d, accountId) : null };
}

export async function setJobStage(me: User, id: string, stage: JobStage, input: { note?: string } = {}, opts: Opts = {}) {
  if (!JOB_STAGES.includes(stage)) throw new LogError("Unknown stage.");
  const d = await db();
  const row = await getJob(d, me, id);
  const prev = track(row);
  const next = applyJobStage(prev, stage, new Date());
  await d.logActivity.create({
    data: { userId: me.id, jobId: id, type: "stage", fromStage: prev.stage, toStage: stage, text: clip(input.note, 4000) || null, byAgent: !!opts.byAgent },
  });
  return d.jobApplication.update({ where: { id }, data: { ...trackData(next, prev), ...(next.lastOutboundAt && !row.appliedAt ? { appliedAt: next.lastOutboundAt } : {}) } });
}

export async function setJobFollowup(me: User, id: string, when: Date | null) {
  const d = await db();
  await getJob(d, me, id);
  return d.jobApplication.update({ where: { id }, data: { nextFollowupAt: when, signaledAt: null } });
}

// ─── Timeline & loading ──────────────────────────────────────

export async function timeline(me: User, kind: "contact" | "job", id: string) {
  const d = await db();
  if (kind === "contact") await getContact(d, me, id);
  else await getJob(d, me, id);
  return d.logActivity.findMany({
    where: kind === "contact" ? { contactId: id } : { jobId: id },
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: { account: { select: { label: true, channel: true } }, user: { select: { name: true } } },
  });
}

/** Moves contacts/jobs whose last follow-up went unanswered to no_response / ghosted. */
export async function sweepStale(now = new Date()) {
  const d = await db();
  let changed = 0;
  const contacts = await d.logContact.findMany({ where: { stage: { in: ["contacted", "followed_up"] }, nextFollowupAt: { lte: now } } });
  for (const c of contacts) {
    const next = expireContact(track(c), now);
    if (!next) continue;
    await d.logContact.update({ where: { id: c.id }, data: next });
    await d.logActivity.create({ data: { contactId: c.id, type: "stage", fromStage: c.stage, toStage: next.stage, text: "No reply after the last follow-up.", byAgent: false } });
    changed++;
  }
  const jobs = await d.jobApplication.findMany({ where: { stage: { in: ["applied", "followed_up"] }, nextFollowupAt: { lte: now } } });
  for (const j of jobs) {
    const next = expireJob(track(j), now);
    if (!next) continue;
    await d.jobApplication.update({ where: { id: j.id }, data: next });
    await d.logActivity.create({ data: { jobId: j.id, type: "stage", fromStage: j.stage, toStage: next.stage, text: "No reply after the last follow-up.", byAgent: false } });
    changed++;
  }
  return changed;
}

export type DueItem = {
  kind: "contact" | "job";
  id: string;
  title: string;
  subtitle: string;
  channel: string;
  stage: string;
  dueAt: string;
  reason: "reply_waiting" | "followup_due" | "interview_followup" | "check_in";
  followupCount: number;
  accountId: string | null;
  campaignId: string | null;
  handle: string;
  url: string;
  ownerId: string | null;
};

const contactDue = (c: LogContact): DueItem => ({
  kind: "contact",
  id: c.id,
  title: c.name,
  subtitle: [c.title, c.company].filter(Boolean).join(" · "),
  channel: c.channel,
  stage: c.stage,
  dueAt: c.nextFollowupAt!.toISOString(),
  reason: awaitingUs(c) ? "reply_waiting" : ["contacted", "followed_up"].includes(c.stage) ? "followup_due" : "check_in",
  followupCount: c.followupCount,
  accountId: c.accountId,
  campaignId: c.campaignId,
  handle: c.handle,
  url: "",
  ownerId: c.ownerId,
});

const jobDue = (j: JobApplication): DueItem => ({
  kind: "job",
  id: j.id,
  title: j.title,
  subtitle: [j.company, j.source].filter(Boolean).join(" · "),
  channel: j.source,
  stage: j.stage,
  dueAt: j.nextFollowupAt!.toISOString(),
  reason: awaitingUs(j) && j.stage === "responded" ? "reply_waiting" : j.stage === "interview" ? "interview_followup" : ["applied", "followed_up"].includes(j.stage) ? "followup_due" : "check_in",
  followupCount: j.followupCount,
  accountId: j.accountId,
  campaignId: null,
  handle: j.contactInfo,
  url: j.url,
  ownerId: j.ownerId,
});

/** Everything due by `until` (default: end of today), oldest first. `me` null = whole agency (cron). */
export async function dueFollowups(me: User | null, until?: Date, campaignId?: string) {
  await sweepStale();
  const d = await db();
  const end = until ?? new Date(zonedISO(todayKey(), 23, 59));
  const scope = me ? await ownerScope(me) : {};
  const [contacts, jobs] = await Promise.all([
    d.logContact.findMany({ where: { ...scope, nextFollowupAt: { lte: end }, ...(campaignId && { campaignId }) }, orderBy: { nextFollowupAt: "asc" }, take: 500 }),
    campaignId ? Promise.resolve([] as JobApplication[]) : d.jobApplication.findMany({ where: { ...scope, nextFollowupAt: { lte: end } }, orderBy: { nextFollowupAt: "asc" }, take: 500 }),
  ]);
  return [...contacts.map(contactDue), ...jobs.map(jobDue)].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export async function loadLog(me: User) {
  await sweepStale();
  const d = await db();
  const scope = await ownerScope(me);
  const [accounts, contacts, jobs, counts, campaigns] = await Promise.all([
    listAccounts(me),
    d.logContact.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 2000 }),
    d.jobApplication.findMany({ where: scope, orderBy: { updatedAt: "desc" }, take: 2000 }),
    sendCounts(me),
    listCampaigns(),
  ]);
  return { accounts, contacts, jobs, counts, campaigns };
}

// ─── Signal settings (webhook to a Claude agent / routine) ───

const SIGNAL_KEY = "outreachLog.signal";
export type SignalConfig = { url: string; bearer: string; enabled: boolean; lastRunAt: string | null; lastStatus: string | null };
const BLANK_SIGNAL: SignalConfig = { url: "", bearer: "", enabled: false, lastRunAt: null, lastStatus: null };

export async function readSignalConfig(): Promise<SignalConfig> {
  const row = await (await db()).setting.findFirst({ where: { key: SIGNAL_KEY } });
  return { ...BLANK_SIGNAL, ...((row?.value as Partial<SignalConfig> | null) ?? {}) };
}

export async function writeSignalConfig(patch: Partial<SignalConfig>) {
  const d = await db();
  const value = { ...(await readSignalConfig()), ...patch } as unknown as object;
  if (await d.setting.findFirst({ where: { key: SIGNAL_KEY } })) await d.setting.updateMany({ where: { key: SIGNAL_KEY }, data: { value } });
  else await d.setting.create({ data: { key: SIGNAL_KEY, value } });
}

export const AGENT_BRIEF =
  "Follow-ups are due in the Strategic CRM Outreach & Jobs log. Each item names its campaign — keep the message on that offer. For each item: open the conversation, send a short, personal follow-up (or answer the reply that is waiting), then call log_touch (contacts) or log_job_event (jobs) on the strategic-crm MCP server so the next follow-up is scheduled. Respect account daily limits; if an item needs a human decision, call set_log_stage with a note instead.";

/**
 * Finds follow-ups that became due since the last signal and POSTs them to the configured
 * webhook (e.g. a Claude Code routine trigger). Each item is signalled once per due date.
 */
export async function signalDueFollowups(): Promise<{ sent: number; status: string }> {
  const cfg = await readSignalConfig();
  if (!cfg.enabled || !/^https:\/\//.test(cfg.url)) return { sent: 0, status: "disabled" };
  const now = new Date();
  const all = await dueFollowups(null, now);
  const d = await db();
  const fresh: DueItem[] = [];
  for (const it of all) {
    const row =
      it.kind === "contact"
        ? await d.logContact.findFirst({ where: { id: it.id }, select: { signaledAt: true } })
        : await d.jobApplication.findFirst({ where: { id: it.id }, select: { signaledAt: true } });
    if (!row?.signaledAt) fresh.push(it);
  }
  if (!fresh.length) return { sent: 0, status: "nothing due" };
  let status: string;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cfg.bearer ? { authorization: `Bearer ${cfg.bearer}` } : {}) },
      body: JSON.stringify({ event: "followups_due", text: `${AGENT_BRIEF}\n\nDue now (${fresh.length}):\n${fresh.map((i) => `- [${i.kind}] ${i.title}${i.subtitle ? ` (${i.subtitle})` : ""} — ${i.reason.replace("_", " ")} via ${i.channel}${i.handle ? ` ${i.handle}` : ""} · id ${i.id}`).join("\n")}`, items: fresh, at: now.toISOString() }),
      signal: AbortSignal.timeout(15000),
    });
    status = `HTTP ${res.status}`;
    if (res.ok) {
      const ids = (k: "contact" | "job") => fresh.filter((i) => i.kind === k).map((i) => i.id);
      if (ids("contact").length) await d.logContact.updateMany({ where: { id: { in: ids("contact") } }, data: { signaledAt: now } });
      if (ids("job").length) await d.jobApplication.updateMany({ where: { id: { in: ids("job") } }, data: { signaledAt: now } });
    }
  } catch (e) {
    status = e instanceof Error ? e.message.slice(0, 120) : "failed";
  }
  await writeSignalConfig({ lastRunAt: now.toISOString(), lastStatus: `${status} · ${fresh.length} item(s)` });
  return { sent: fresh.length, status };
}
