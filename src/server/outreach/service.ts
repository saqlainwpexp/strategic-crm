// Social outreach service layer: everything that reads or writes outreach data goes through
// here. The pure rules live in src/lib/outreach/rules.ts; this file applies them to the DB.

import type { OutreachThread, PrismaClient } from "@prisma/client";
import { getDb } from "../db";
import { visibleUserIds } from "../session";
import { getBranding } from "../settings";
import { fireTrigger } from "../email/triggers";
import { setTimeZone, shiftDayKey, todayKey, zonedISO } from "@/lib/date";
import { normalizeProfile } from "@/lib/outreach/normalize";
import {
  DEFAULT_LEAD_SOURCES,
  STAGE_LABEL,
  isPlatform,
  platformDef,
  platformLabel,
  type OutreachActivityType,
  type OutreachStage,
  type PlatformId,
  type ReplySentiment,
} from "@/lib/outreach/platforms";
import {
  applyActivity,
  applyStage,
  expireIfSilent,
  limitKind,
  limitStatus,
  pipelineStageFor,
  type ThreadState,
} from "@/lib/outreach/rules";
import type { OActivity, OThread, OutreachData, QuickLogKind } from "@/lib/outreach/types";
import type { User } from "@/lib/types";

type Db = PrismaClient;
const DAY = 864e5;
const ACTIVITY_DAYS = 120;
const LEAD_SOURCES_KEY = "outreach.leadSources";

export class OutreachError extends Error {
  constructor(message: string, readonly code: "forbidden" | "notfound" | "invalid" | "limit" = "invalid") {
    super(message);
  }
}

const isManager = (u: User) => u.role === "MANAGER" || u.role === "SUPER_ADMIN";
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

async function db(): Promise<Db> {
  setTimeZone((await getBranding()).timezone);
  return getDb();
}

export const outreachDb = () => db();

/** Owner ids whose threads `me` may see; null = everyone. Reps: own; BD: own + reports. */
export async function threadOwnerScope(me: User) {
  return visibleUserIds(me);
}

async function threadInScope(d: Db, me: User, threadId: string) {
  const t = await d.outreachThread.findUnique({ where: { id: threadId } });
  if (!t) throw new OutreachError("That conversation no longer exists.", "notfound");
  const ids = await threadOwnerScope(me);
  if (ids && !(t.ownerId && ids.has(t.ownerId))) throw new OutreachError("That conversation belongs to someone else.", "forbidden");
  return t;
}

function stateOf(t: OutreachThread): ThreadState {
  return {
    stage: t.stage as OutreachStage,
    connectionSentAt: t.connectionSentAt,
    connectionAcceptedAt: t.connectionAcceptedAt,
    firstMessageAt: t.firstMessageAt,
    lastOutboundAt: t.lastOutboundAt,
    lastInboundAt: t.lastInboundAt,
    followupCount: t.followupCount,
    nextFollowupAt: t.nextFollowupAt,
  };
}

// ─── Lead sources (Admin-editable dropdown) ──────────────────

export async function getLeadSources(d?: Db): Promise<string[]> {
  const row = await (d ?? (await db())).setting.findFirst({ where: { key: LEAD_SOURCES_KEY } });
  const v = row?.value;
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : DEFAULT_LEAD_SOURCES;
}

export async function saveLeadSources(me: User, sources: string[]) {
  if (me.role !== "SUPER_ADMIN") throw new OutreachError("Only admins can edit lead sources.", "forbidden");
  const clean = [...new Set(sources.map((s) => s.trim().slice(0, 120)).filter(Boolean))].slice(0, 100);
  const d = await db();
  const existing = await d.setting.findFirst({ where: { key: LEAD_SOURCES_KEY } });
  if (existing) await d.setting.updateMany({ where: { key: LEAD_SOURCES_KEY }, data: { value: clean } });
  else await d.setting.create({ data: { key: LEAD_SOURCES_KEY, value: clean } });
  return clean;
}

// ─── Loading ─────────────────────────────────────────────────

export const EMPTY_OUTREACH: OutreachData = { profiles: [], threads: [], activities: [], templates: [], campaigns: [], accounts: [], leadSources: DEFAULT_LEAD_SOURCES, leadFields: {} };

/** Never takes the app down: if the outreach tables aren't migrated yet, the CRM still loads. */
export async function loadOutreachData(me: User): Promise<OutreachData> {
  try {
    return await loadOutreachDataUnsafe(me);
  } catch (e) {
    console.error("[outreach] could not load social outreach data — has the 20261107_social_outreach migration run?", e);
    return EMPTY_OUTREACH;
  }
}

async function loadOutreachDataUnsafe(me: User): Promise<OutreachData> {
  const d = await db();
  const ids = await threadOwnerScope(me);
  const ownerWhere = ids ? { ownerId: { in: [...ids] } } : {};

  let threads = await d.outreachThread.findMany({ where: ownerWhere, orderBy: { updatedAt: "desc" } });

  // Silent threads past their last follow-up become no_response.
  const now = new Date();
  const expired = threads.flatMap((t) => {
    const next = expireIfSilent(stateOf(t), now);
    return next ? [t.id] : [];
  });
  if (expired.length) {
    await d.outreachThread.updateMany({ where: { id: { in: expired } }, data: { stage: "no_response", nextFollowupAt: null } });
    threads = threads.map((t) => (expired.includes(t.id) ? { ...t, stage: "no_response", nextFollowupAt: null } : t));
  }

  const threadIds = threads.map((t) => t.id);
  const leadIds = [...new Set(threads.map((t) => t.leadId))];
  const leadScope = ids ? { assignedToId: { in: [...ids] } } : {};

  const [activities, leads, visibleLeads, templates, campaigns, accounts, leadSources] = await Promise.all([
    d.outreachActivity.findMany({
      where: { occurredAt: { gte: new Date(Date.now() - ACTIVITY_DAYS * DAY) }, ...(ids ? { threadId: { in: threadIds } } : {}) },
      orderBy: { occurredAt: "desc" },
      take: 20000,
    }),
    d.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, businessName: true, decisionMakerName: true, jobTitle: true } }),
    d.lead.findMany({
      where: leadScope,
      select: { id: true, jobTitle: true, industry: true, location: true, connectionDegree: true, followerCount: true, primaryChannel: true },
    }),
    d.outreachTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    d.outreachCampaign.findMany({ orderBy: { createdAt: "desc" } }),
    d.socialAccount.findMany({ where: isManager(me) ? {} : { userId: me.id } }),
    getLeadSources(d),
  ]);
  const profileLeadIds = [...new Set([...leadIds, ...visibleLeads.map((l) => l.id)])];
  const profiles = await d.leadSocialProfile.findMany({ where: { leadId: { in: profileLeadIds } } });

  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const profileMap = new Map(profiles.map((p) => [`${p.leadId}:${p.platform}`, p.url]));
  const threadLead = new Map(threads.map((t) => [t.id, t.leadId]));

  return {
    profiles: profiles.map((p) => ({ id: p.id, leadId: p.leadId, platform: p.platform, url: p.url })),
    threads: threads.map((t): OThread => {
      const l = leadMap.get(t.leadId);
      return {
        id: t.id,
        leadId: t.leadId,
        ownerId: t.ownerId,
        platform: t.platform,
        threadUrl: t.threadUrl ?? "",
        stage: t.stage as OutreachStage,
        connectionSentAt: iso(t.connectionSentAt),
        connectionAcceptedAt: iso(t.connectionAcceptedAt),
        firstMessageAt: iso(t.firstMessageAt),
        lastOutboundAt: iso(t.lastOutboundAt),
        lastInboundAt: iso(t.lastInboundAt),
        followupCount: t.followupCount,
        nextFollowupAt: iso(t.nextFollowupAt),
        replySentiment: (t.replySentiment as ReplySentiment | null) ?? null,
        templateId: t.templateId,
        campaignId: t.campaignId,
        notes: t.notes ?? "",
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        leadName: l?.decisionMakerName || l?.businessName || "Unknown",
        company: l?.decisionMakerName ? l.businessName : "",
        jobTitle: l?.jobTitle ?? "",
        profileUrl: profileMap.get(`${t.leadId}:${t.platform}`) ?? "",
      };
    }),
    activities: activities.map(
      (a): OActivity => ({
        id: a.id,
        threadId: a.threadId,
        leadId: threadLead.get(a.threadId) ?? "",
        userId: a.userId,
        platform: a.platform,
        direction: a.direction,
        type: a.type as OutreachActivityType,
        messageText: a.messageText ?? "",
        occurredAt: a.occurredAt.toISOString(),
      })
    ),
    templates: templates.map((t) => ({ id: t.id, name: t.name, platform: t.platform, body: t.body, active: t.active, createdById: t.createdById })),
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      platform: c.platform,
      audience: c.audience ?? "",
      templateId: c.templateId,
      startDate: iso(c.startDate),
      dailyLimit: c.dailyLimit,
      goal: c.goal ?? "",
      status: c.status,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      userId: a.userId,
      platform: a.platform,
      handle: a.handle,
      dailyConnectionLimit: a.dailyConnectionLimit,
      dailyDmLimit: a.dailyDmLimit,
    })),
    leadSources,
    leadFields: Object.fromEntries(
      visibleLeads.map((l) => [
        l.id,
        {
          jobTitle: l.jobTitle ?? "",
          industry: l.industry ?? "",
          location: l.location ?? "",
          connectionDegree: l.connectionDegree ?? "",
          followerCount: l.followerCount,
          primaryChannel: l.primaryChannel ?? "",
        },
      ])
    ),
  };
}

// ─── Daily limits ────────────────────────────────────────────

function startOfToday() {
  return new Date(zonedISO(todayKey(), 0));
}

export async function limitsFor(d: Db, userId: string, platform: PlatformId) {
  const def = platformDef(platform)!;
  const acct = await d.socialAccount.findFirst({ where: { userId, platform } });
  return {
    connection: acct?.dailyConnectionLimit ?? def.defaultConnectionLimit,
    dm: acct?.dailyDmLimit ?? def.defaultDmLimit,
  };
}

export async function sentToday(d: Db, userId: string, platform: string) {
  const rows = await d.outreachActivity.groupBy({
    by: ["type"],
    where: { userId, platform, direction: "outbound", occurredAt: { gte: startOfToday() } },
    _count: { _all: true },
  });
  const count = (types: string[]) => rows.filter((r) => types.includes(r.type)).reduce((s, r) => s + r._count._all, 0);
  return { connection: count(["connection_request"]), dm: count(["dm", "voice_note", "story_reply"]) };
}

/** Throws when the send would go over today's limit (admins/managers may override). */
async function checkLimit(d: Db, me: User, platform: PlatformId, type: OutreachActivityType, override: boolean) {
  const kind = limitKind(type);
  if (!kind) return null;
  const [limits, sent] = await Promise.all([limitsFor(d, me.id, platform), sentToday(d, me.id, platform)]);
  const limit = limits[kind];
  const what = kind === "connection" ? "connection requests" : "DMs";
  if (sent[kind] >= limit && limit > 0) {
    if (!(override && isManager(me)))
      throw new OutreachError(
        `Daily limit reached: ${sent[kind]}/${limit} ${platformLabel(platform)} ${what} today.${isManager(me) ? " Use override to send anyway." : " Ask a manager to raise your limit."}`,
        "limit"
      );
    return `Over today's limit (${sent[kind] + 1}/${limit} ${what}) — sent with admin override.`;
  }
  const after = limitStatus(sent[kind] + 1, limit);
  if (after === "warn") return `Heads up: ${sent[kind] + 1}/${limit} ${platformLabel(platform)} ${what} today.`;
  if (after === "block") return `That was your last ${platformLabel(platform)} ${kind === "connection" ? "connection request" : "DM"} for today (${limit}/${limit}).`;
  return null;
}

// ─── Leads and duplicate check ───────────────────────────────

export type LeadInput = {
  platform: PlatformId;
  profile: string;
  name?: string;
  title?: string;
  company?: string;
  location?: string;
  industry?: string;
  email?: string;
  phone?: string;
  website?: string;
  connectionDegree?: string;
  followerCount?: number | null;
  source?: string;
  tags?: string[];
};

/**
 * Finds the lead that already owns this profile (by normalised URL/handle) or creates one.
 * `updated` is true when an existing lead got new blank fields filled in.
 */
export async function findOrCreateLead(me: User, input: LeadInput, d?: Db) {
  d ??= await db();
  const norm = normalizeProfile(input.platform, input.profile);
  if (!norm) throw new OutreachError(`That doesn't look like a ${platformLabel(input.platform)} profile.`);

  const existing = await d.leadSocialProfile.findFirst({ where: { platform: norm.platform, key: norm.key } });
  if (existing) {
    const lead = await d.lead.findUnique({ where: { id: existing.leadId } });
    if (!lead) throw new OutreachError("That lead no longer exists.", "notfound");
    // Fill in blanks only — never overwrite what a rep typed.
    const fill: Record<string, unknown> = {};
    if (!lead.jobTitle && input.title) fill.jobTitle = input.title.slice(0, 190);
    if (!lead.location && input.location) fill.location = input.location.slice(0, 190);
    if (!lead.industry && input.industry) fill.industry = input.industry.slice(0, 190);
    if (!lead.email && input.email) fill.email = input.email.slice(0, 254);
    if (!lead.phone && input.phone) fill.phone = input.phone.slice(0, 40);
    if (!lead.connectionDegree && input.connectionDegree) fill.connectionDegree = normDegree(input.connectionDegree);
    if (lead.followerCount == null && input.followerCount != null) fill.followerCount = input.followerCount;
    if (Object.keys(fill).length) await d.lead.update({ where: { id: lead.id }, data: fill });
    return { lead, created: false, updated: Object.keys(fill).length > 0 };
  }

  const name = (input.name ?? "").trim().slice(0, 200);
  const company = (input.company ?? "").trim().slice(0, 200);
  const lead = await d.lead.create({
    data: {
      businessName: company || name || norm.key,
      decisionMakerName: name || null,
      jobTitle: input.title?.trim().slice(0, 190) || null,
      location: input.location?.trim().slice(0, 190) || null,
      industry: input.industry?.trim().slice(0, 190) || null,
      email: input.email?.trim().slice(0, 254) || null,
      phone: input.phone?.trim().slice(0, 40) || null,
      website: input.website?.trim().slice(0, 300) || null,
      connectionDegree: normDegree(input.connectionDegree),
      followerCount: input.followerCount ?? null,
      primaryChannel: input.platform,
      source: input.source?.slice(0, 120) || platformLabel(input.platform),
      assignedToId: me.id,
      tags: input.tags?.length ? input.tags : undefined,
    },
  });
  await d.leadSocialProfile.create({ data: { leadId: lead.id, platform: norm.platform, key: norm.key, url: norm.url } });
  await fireTrigger("LEAD_CREATED", [lead.id]).catch(() => undefined);
  return { lead, created: true, updated: false };
}

function normDegree(v?: string | null) {
  const m = (v ?? "").match(/[123]/);
  return m ? ({ "1": "1st", "2": "2nd", "3": "3rd" } as const)[m[0] as "1" | "2" | "3"] : null;
}

/** The lead's thread on `platform`, created (owned by `me`) if missing. */
export async function ensureThread(me: User, leadId: string, platform: PlatformId, extra: { campaignId?: string | null } = {}, d?: Db) {
  d ??= await db();
  const found = await d.outreachThread.findFirst({ where: { leadId, platform } });
  if (found) {
    if (extra.campaignId && !found.campaignId) return d.outreachThread.update({ where: { id: found.id }, data: { campaignId: extra.campaignId } });
    return found;
  }
  const campaign = extra.campaignId ? await d.outreachCampaign.findUnique({ where: { id: extra.campaignId } }) : null;
  return d.outreachThread.create({
    data: { leadId, platform, ownerId: me.id, campaignId: campaign?.id ?? null, templateId: campaign?.templateId ?? null },
  });
}

/** Lead in my scope (as for calls), or a thread on it that I own. */
async function assertLeadAccess(d: Db, me: User, leadId: string) {
  const lead = await d.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true } });
  if (!lead) throw new OutreachError("That lead no longer exists.", "notfound");
  const ids = await threadOwnerScope(me);
  if (!ids || (lead.assignedToId && ids.has(lead.assignedToId))) return lead;
  if (await d.outreachThread.findFirst({ where: { leadId, ownerId: { in: [...ids] } }, select: { id: true } })) return lead;
  throw new OutreachError("That lead belongs to someone else.", "forbidden");
}

export async function openThread(me: User, leadId: string, platform: string) {
  if (!isPlatform(platform)) throw new OutreachError("Unknown platform.");
  const d = await db();
  await assertLeadAccess(d, me, leadId);
  return ensureThread(me, leadId, platform, {}, d);
}

// ─── Logging ─────────────────────────────────────────────────

function appendNote(existing: string | null, note: string | undefined, label: string) {
  const n = (note ?? "").trim();
  if (!n) return existing ?? undefined;
  const stamp = new Date().toISOString().slice(0, 10);
  return `${existing ? `${existing}\n` : ""}[${stamp} · ${label}] ${n}`.slice(-20000);
}

export async function logActivity(
  me: User,
  input: { threadId: string; direction: "outbound" | "inbound"; type: OutreachActivityType; messageText?: string; occurredAt?: Date; override?: boolean }
) {
  const d = await db();
  const t = await threadInScope(d, me, input.threadId);
  const platform = t.platform as PlatformId;
  const warning = input.direction === "outbound" ? await checkLimit(d, me, platform, input.type, !!input.override) : null;
  const occurredAt = input.occurredAt && input.occurredAt.getTime() <= Date.now() + 60_000 ? input.occurredAt : new Date();
  const next = applyActivity(stateOf(t), { direction: input.direction, type: input.type, occurredAt });

  await d.outreachActivity.create({
    data: {
      threadId: t.id,
      userId: me.id,
      platform,
      direction: input.direction,
      type: input.type,
      messageText: input.messageText?.trim().slice(0, 10000) || null,
      occurredAt,
    },
  });
  const updated = await d.outreachThread.update({ where: { id: t.id }, data: { ...next, ownerId: t.ownerId ?? me.id } });
  if (input.direction === "outbound") await d.lead.update({ where: { id: t.leadId }, data: { lastContactedAt: occurredAt } });
  await syncPipeline(d, me, updated, next.stage);
  return { warning };
}

export async function setStage(
  me: User,
  input: { threadId: string; stage: OutreachStage; note?: string; meetingAt?: Date | null; sentiment?: ReplySentiment | null }
) {
  const d = await db();
  const t = await threadInScope(d, me, input.threadId);
  const next = applyStage(stateOf(t), input.stage, new Date());
  const updated = await d.outreachThread.update({
    where: { id: t.id },
    data: {
      ...next,
      ownerId: t.ownerId ?? me.id,
      notes: appendNote(t.notes, input.note, STAGE_LABEL[input.stage]),
      ...(input.sentiment !== undefined ? { replySentiment: input.sentiment } : {}),
    },
  });
  const meeting = await syncPipeline(d, me, updated, input.stage, input.meetingAt ?? undefined, input.note);
  return { meeting };
}

/**
 * interested / call_booked / won push the lead's pipeline stage forward, and a booked call
 * becomes a Schedule meeting — which the existing reminder system then alerts on.
 */
async function syncPipeline(d: Db, me: User, t: OutreachThread, stage: OutreachStage, meetingAt?: Date, note?: string) {
  const lead = await d.lead.findUnique({ where: { id: t.leadId }, select: { id: true, stage: true, closedAt: true, businessName: true, decisionMakerName: true } });
  if (!lead) return null;
  const target = pipelineStageFor(stage, lead.stage);
  if (target) {
    await d.lead.update({
      where: { id: lead.id },
      data: { stage: target as never, closedAt: target === "CLOSED_WON" ? lead.closedAt ?? new Date() : lead.closedAt },
    });
    await fireTrigger("STAGE_CHANGED", [lead.id], target).catch(() => undefined);
  }
  if (stage !== "call_booked") return null;
  const when = meetingAt && !isNaN(meetingAt.getTime()) ? meetingAt : new Date(zonedISO(shiftDayKey(todayKey(), 1), 10));
  const userId = t.ownerId ?? me.id;
  const upcoming = await d.meeting.findFirst({ where: { leadId: lead.id, status: "BOOKED", scheduledAt: { gte: new Date() } } });
  const who = lead.decisionMakerName || lead.businessName;
  if (upcoming) {
    return d.meeting.update({ where: { id: upcoming.id }, data: { scheduledAt: when, notes: note ? note.slice(0, 4000) : upcoming.notes } });
  }
  return d.meeting.create({
    data: {
      leadId: lead.id,
      userId,
      title: `Call with ${who} (${platformLabel(t.platform)})`.slice(0, 120),
      type: "DISCOVERY",
      scheduledAt: when,
      durationMin: 30,
      notes: note?.slice(0, 4000) || `Booked from ${platformLabel(t.platform)} outreach.`,
    },
  });
}

/** One-click logging from the Loadboard card. */
export async function quickLog(
  me: User,
  input: { threadId: string; kind: QuickLogKind; note?: string; meetingAt?: Date | null; override?: boolean; sentiment?: ReplySentiment | null }
) {
  const { threadId, note, override } = input;
  switch (input.kind) {
    case "sent_connection":
      return logActivity(me, { threadId, direction: "outbound", type: "connection_request", messageText: note, override });
    case "sent_dm":
      return logActivity(me, { threadId, direction: "outbound", type: "dm", messageText: note, override });
    case "replied": {
      const r = await logActivity(me, { threadId, direction: "inbound", type: "dm", messageText: note });
      if (input.sentiment) await setSentiment(me, threadId, input.sentiment);
      return r;
    }
    case "accepted":
      await setStage(me, { threadId, stage: "connected", note });
      return { warning: null };
    case "interested":
      await setStage(me, { threadId, stage: "interested", note, sentiment: input.sentiment ?? "positive" });
      return { warning: null };
    case "booked":
      await setStage(me, { threadId, stage: "call_booked", note, meetingAt: input.meetingAt });
      return { warning: null };
    case "not_interested":
      await setStage(me, { threadId, stage: "not_interested", note });
      return { warning: null };
    case "won":
      await setStage(me, { threadId, stage: "won", note });
      return { warning: null };
  }
}

export async function setSentiment(me: User, threadId: string, sentiment: ReplySentiment | null) {
  const d = await db();
  await threadInScope(d, me, threadId);
  await d.outreachThread.update({ where: { id: threadId }, data: { replySentiment: sentiment } });
}

export async function updateThread(
  me: User,
  threadId: string,
  patch: { threadUrl?: string; campaignId?: string | null; templateId?: string | null; notes?: string; ownerId?: string | null }
) {
  const d = await db();
  await threadInScope(d, me, threadId);
  if (patch.ownerId !== undefined) {
    const ids = await threadOwnerScope(me);
    if (ids && patch.ownerId && !ids.has(patch.ownerId)) throw new OutreachError("You can't hand this to that person.", "forbidden");
  }
  await d.outreachThread.update({
    where: { id: threadId },
    data: {
      ...(patch.threadUrl !== undefined ? { threadUrl: patch.threadUrl.trim().slice(0, 500) || null } : {}),
      ...(patch.campaignId !== undefined ? { campaignId: patch.campaignId } : {}),
      ...(patch.templateId !== undefined ? { templateId: patch.templateId } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes.slice(0, 20000) } : {}),
      ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
    },
  });
}

// ─── Lead social fields + profiles ───────────────────────────

export async function saveLeadSocial(
  me: User,
  leadId: string,
  input: {
    profiles?: { platform: string; value: string }[];
    jobTitle?: string;
    industry?: string;
    location?: string;
    connectionDegree?: string;
    followerCount?: number | null;
    primaryChannel?: string;
  }
) {
  const d = await db();
  await assertLeadAccess(d, me, leadId);
  const data: Record<string, unknown> = {};
  for (const k of ["jobTitle", "industry", "location"] as const) if (input[k] !== undefined) data[k] = input[k]!.trim().slice(0, 190) || null;
  if (input.connectionDegree !== undefined) data.connectionDegree = normDegree(input.connectionDegree);
  if (input.followerCount !== undefined) data.followerCount = input.followerCount == null || isNaN(input.followerCount) ? null : Math.max(0, Math.round(input.followerCount));
  if (input.primaryChannel !== undefined) data.primaryChannel = input.primaryChannel || null;
  if (Object.keys(data).length) await d.lead.update({ where: { id: leadId }, data });

  for (const p of input.profiles ?? []) {
    if (!isPlatform(p.platform)) continue;
    const current = await d.leadSocialProfile.findFirst({ where: { leadId, platform: p.platform } });
    if (!p.value.trim()) {
      if (current) await d.leadSocialProfile.delete({ where: { id: current.id } });
      continue;
    }
    const norm = normalizeProfile(p.platform, p.value);
    if (!norm) throw new OutreachError(`That doesn't look like a ${platformLabel(p.platform)} profile: ${p.value}`);
    const clash = await d.leadSocialProfile.findFirst({ where: { platform: norm.platform, key: norm.key } });
    if (clash && clash.leadId !== leadId) {
      const other = await d.lead.findUnique({ where: { id: clash.leadId }, select: { businessName: true } });
      throw new OutreachError(`That ${platformLabel(p.platform)} profile already belongs to "${other?.businessName ?? "another lead"}".`);
    }
    if (current) await d.leadSocialProfile.update({ where: { id: current.id }, data: { key: norm.key, url: norm.url } });
    else await d.leadSocialProfile.create({ data: { leadId, platform: norm.platform, key: norm.key, url: norm.url } });
  }
}

// ─── Quick-add (bookmarklet / API) ───────────────────────────

export async function quickAdd(me: User, input: { url: string; name?: string; title?: string; company?: string }, source = "Bookmarklet") {
  const { detectPlatform } = await import("@/lib/outreach/normalize");
  const platform = detectPlatform(input.url);
  if (!platform) throw new OutreachError("This page isn't a LinkedIn, Facebook, Instagram, Threads, X or TikTok profile.");
  const d = await db();
  const { lead, created } = await findOrCreateLead(
    me,
    { platform, profile: input.url, name: input.name, title: input.title, company: input.company, source },
    d
  );
  const thread = await ensureThread(me, lead.id, platform, {}, d);
  if (!thread.threadUrl && /\/messaging\/|\/messages\/|\/direct\//.test(input.url))
    await d.outreachThread.update({ where: { id: thread.id }, data: { threadUrl: input.url.slice(0, 500) } });
  return { created, platform, leadId: lead.id, threadId: thread.id, name: lead.decisionMakerName || lead.businessName, stage: thread.stage };
}

// ─── Import ──────────────────────────────────────────────────

export type ImportRow = Omit<LeadInput, "platform"> & { platform?: string };

export async function importSocial(me: User, rows: ImportRow[], opts: { platform?: string; campaignId?: string | null; source?: string; tags?: string[] }) {
  if (!isManager(me) && me.role !== "BD") throw new OutreachError("Only managers can import leads.", "forbidden");
  const d = await db();
  const { detectPlatform } = await import("@/lib/outreach/normalize");
  const summary = { created: 0, updated: 0, skipped: 0, errors: [] as string[] };
  for (const [i, row] of rows.slice(0, 5000).entries()) {
    const platform = (isPlatform(row.platform) ? row.platform : null) ?? detectPlatform(row.profile) ?? (isPlatform(opts.platform) ? opts.platform : null);
    if (!platform || !row.profile?.trim()) {
      summary.skipped++;
      if (summary.errors.length < 50) summary.errors.push(`Row ${i + 2}: no profile URL or handle.`);
      continue;
    }
    try {
      const r = await findOrCreateLead(me, { ...row, platform, source: row.source || opts.source, tags: opts.tags }, d);
      await ensureThread(me, r.lead.id, platform, { campaignId: opts.campaignId ?? null }, d);
      if (r.created) summary.created++;
      else if (r.updated) summary.updated++;
      else summary.skipped++;
    } catch (e) {
      summary.skipped++;
      if (summary.errors.length < 50) summary.errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : "could not be saved"}`);
    }
  }
  return summary;
}

// ─── Admin: templates, campaigns, accounts ───────────────────

function requireManager(me: User) {
  if (!isManager(me)) throw new OutreachError("Only managers and admins can change this.", "forbidden");
}

export async function saveTemplate(me: User, t: { id?: string; name: string; platform: string; body: string; active: boolean }) {
  requireManager(me);
  const d = await db();
  const data = { name: t.name.trim().slice(0, 190) || "Untitled", platform: isPlatform(t.platform) ? t.platform : "any", body: t.body.slice(0, 8000), active: t.active };
  if (t.id) return d.outreachTemplate.update({ where: { id: t.id }, data });
  return d.outreachTemplate.create({ data: { ...data, createdById: me.id } });
}

export async function deleteTemplate(me: User, id: string) {
  requireManager(me);
  await (await db()).outreachTemplate.delete({ where: { id } });
}

export async function saveCampaign(
  me: User,
  c: { id?: string; name: string; platform: string; audience: string; templateId: string | null; startDate: string | null; dailyLimit: number | null; goal: string; status: string }
) {
  requireManager(me);
  const d = await db();
  const data = {
    name: c.name.trim().slice(0, 190) || "Untitled campaign",
    platform: isPlatform(c.platform) ? c.platform : "linkedin",
    audience: c.audience.slice(0, 4000) || null,
    templateId: c.templateId || null,
    startDate: c.startDate ? new Date(c.startDate) : null,
    dailyLimit: c.dailyLimit && c.dailyLimit > 0 ? Math.round(c.dailyLimit) : null,
    goal: c.goal.slice(0, 4000) || null,
    status: ["draft", "active", "paused", "completed"].includes(c.status) ? c.status : "draft",
  };
  if (c.id) return d.outreachCampaign.update({ where: { id: c.id }, data });
  return d.outreachCampaign.create({ data });
}

export async function deleteCampaign(me: User, id: string) {
  requireManager(me);
  await (await db()).outreachCampaign.delete({ where: { id } });
}

export async function saveSocialAccount(me: User, a: { id?: string; userId: string; platform: string; handle: string; dailyConnectionLimit: number; dailyDmLimit: number }) {
  requireManager(me);
  if (!isPlatform(a.platform)) throw new OutreachError("Unknown platform.");
  const d = await db();
  const data = {
    userId: a.userId,
    platform: a.platform,
    handle: a.handle.trim().slice(0, 190),
    dailyConnectionLimit: Math.max(0, Math.round(a.dailyConnectionLimit || 0)),
    dailyDmLimit: Math.max(0, Math.round(a.dailyDmLimit || 0)),
  };
  if (a.id) return d.socialAccount.update({ where: { id: a.id }, data });
  return d.socialAccount.create({ data });
}

export async function deleteSocialAccount(me: User, id: string) {
  requireManager(me);
  await (await db()).socialAccount.delete({ where: { id } });
}
