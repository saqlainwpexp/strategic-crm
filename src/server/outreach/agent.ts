// What an outreach agent can do through MCP: log what it sent/saw, change a stage, check a
// profile before messaging, and list its follow-ups. Same rules and limits as reps in the UI.

import type { OutreachThread, PrismaClient } from "@prisma/client";
import {
  OutreachError,
  ensureThread,
  findOrCreateLead,
  limitsFor,
  logActivity,
  outreachDb,
  sentToday,
  setStage,
  threadOwnerScope,
} from "./service";
import { detectPlatform, normalizeProfile } from "@/lib/outreach/normalize";
import { isPlatform, platformLabel, type OutreachStage, type PlatformId, type ReplySentiment } from "@/lib/outreach/platforms";
import { shiftDayKey, todayKey, zonedISO } from "@/lib/date";
import type { User } from "@/lib/types";

type Db = PrismaClient;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export const AGENT_ACTIONS = ["connection_request", "dm", "comment", "like", "story_reply", "voice_note", "reply_received", "connection_accepted"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

async function findByProfile(d: Db, profile: string, platformHint?: string) {
  const platform: PlatformId | null = (isPlatform(platformHint) ? platformHint : null) ?? detectPlatform(profile);
  if (!platform) throw new OutreachError("Couldn't tell the platform from that profile — pass `platform` (linkedin, facebook, instagram, threads, x, tiktok).");
  const norm = normalizeProfile(platform, profile);
  if (!norm) throw new OutreachError(`That doesn't look like a ${platformLabel(platform)} profile.`);
  const prof = await d.leadSocialProfile.findFirst({ where: { platform, key: norm.key } });
  return { platform, norm, leadId: prof?.leadId ?? null };
}

async function threadSummary(d: Db, threadId: string) {
  const t = await d.outreachThread.findUnique({ where: { id: threadId } });
  if (!t) return null;
  const lead = await d.lead.findUnique({ where: { id: t.leadId }, select: { businessName: true, decisionMakerName: true, stage: true } });
  return {
    lead_id: t.leadId,
    thread_id: t.id,
    name: lead?.decisionMakerName || lead?.businessName,
    platform: t.platform,
    stage: t.stage,
    pipeline_stage: lead?.stage,
    followups_sent: t.followupCount,
    next_followup_at: iso(t.nextFollowupAt),
    last_outbound_at: iso(t.lastOutboundAt),
    last_inbound_at: iso(t.lastInboundAt),
  };
}

/** Log one thing the agent did (or saw) for a profile, creating the lead/thread if new. */
export async function agentLog(
  me: User,
  input: { profile: string; platform?: string; action: AgentAction; message?: string; name?: string; company?: string; title?: string; threadUrl?: string; occurredAt?: Date }
) {
  const d = await outreachDb();
  const { platform } = await findByProfile(d, input.profile, input.platform);
  const { lead, created } = await findOrCreateLead(
    me,
    { platform, profile: input.profile, name: input.name, title: input.title, company: input.company, source: "Outreach agent" },
    d
  );
  const thread = await ensureThread(me, lead.id, platform, {}, d);
  if (thread.ownerId && thread.ownerId !== me.id) {
    const ids = await threadOwnerScope(me);
    if (ids && !ids.has(thread.ownerId)) throw new OutreachError("Another rep already owns this conversation — not logged. Don't message this person.", "forbidden");
  }
  if (input.threadUrl && /^https?:\/\//i.test(input.threadUrl) && !thread.threadUrl)
    await d.outreachThread.update({ where: { id: thread.id }, data: { threadUrl: input.threadUrl.slice(0, 500) } });

  let warning: string | null = null;
  if (input.action === "connection_accepted") await setStage(me, { threadId: thread.id, stage: "connected", note: input.message });
  else {
    const action = input.action;
    const inbound = action === "reply_received";
    const r = await logActivity(me, {
      threadId: thread.id,
      direction: inbound ? "inbound" : "outbound",
      type: action === "reply_received" ? "dm" : action,
      messageText: input.message,
      occurredAt: input.occurredAt,
    });
    warning = r.warning;
  }
  return { logged: true, lead_created: created, warning, ...(await threadSummary(d, thread.id)) };
}

export async function agentSetStage(
  me: User,
  input: { profile: string; platform?: string; stage: OutreachStage; note?: string; meetingAt?: Date; sentiment?: ReplySentiment }
) {
  const d = await outreachDb();
  const { platform, leadId } = await findByProfile(d, input.profile, input.platform);
  if (!leadId) throw new OutreachError("That profile isn't in the CRM yet — log an outreach first.", "notfound");
  const thread = await ensureThread(me, leadId, platform, {}, d);
  const { meeting } = await setStage(me, { threadId: thread.id, stage: input.stage, note: input.note, meetingAt: input.meetingAt ?? null, sentiment: input.sentiment });
  return { ...(await threadSummary(d, thread.id)), meeting_booked_for: meeting ? iso(meeting.scheduledAt) : null };
}

/** Is this person already in the CRM, and what happened so far? */
export async function agentLookup(me: User, input: { profile: string; platform?: string }) {
  const d = await outreachDb();
  const { platform, norm, leadId } = await findByProfile(d, input.profile, input.platform);
  if (!leadId) return { exists: false, platform, profile: norm.url, advice: "New person — OK to reach out." };
  const threads = await d.outreachThread.findMany({ where: { leadId } });
  const t = threads.find((x) => x.platform === platform);
  const ids = await threadOwnerScope(me);
  const owner = t?.ownerId ? await d.user.findUnique({ where: { id: t.ownerId }, select: { name: true } }) : null;
  const visible = !t || !ids || (!!t.ownerId && ids.has(t.ownerId));
  const recent = t && visible ? await d.outreachActivity.findMany({ where: { threadId: t.id }, orderBy: { occurredAt: "desc" }, take: 5 }) : [];
  const ownedByOther = !!t?.ownerId && t.ownerId !== me.id;
  return {
    exists: true,
    platform,
    owned_by: owner?.name ?? null,
    owned_by_you: t?.ownerId === me.id,
    advice: ownedByOther ? "Another rep owns this conversation — do not message." : t && ["won", "lost", "not_interested"].includes(t.stage) ? "Closed — do not message." : "Already known — continue the existing conversation.",
    ...(t ? await threadSummary(d, t.id) : { stage: "not_contacted" }),
    other_platforms: threads.filter((x) => x.platform !== platform).map((x) => ({ platform: x.platform, stage: x.stage })),
    recent_activity: recent.map((a) => ({ direction: a.direction, type: a.type, at: a.occurredAt.toISOString(), message: a.messageText?.slice(0, 300) ?? null })),
  };
}

/** The token user's work list: replies waiting on us, follow-ups due by end of today, today's send counts. */
export async function agentDue(me: User, input: { platform?: string; limit?: number }) {
  const d = await outreachDb();
  const platform = isPlatform(input.platform) ? input.platform : undefined;
  const now = new Date();
  const endOfToday = new Date(zonedISO(shiftDayKey(todayKey(), 1), 0));
  const threads = await d.outreachThread.findMany({
    where: {
      ownerId: me.id,
      ...(platform ? { platform } : {}),
      stage: { notIn: ["won", "lost", "not_interested", "no_response"] },
      OR: [{ nextFollowupAt: { lt: endOfToday } }, { lastInboundAt: { not: null } }],
    },
    orderBy: { nextFollowupAt: "asc" },
    take: 1000,
  });
  const awaiting = (t: OutreachThread) => !!t.lastInboundAt && (!t.lastOutboundAt || t.lastInboundAt > t.lastOutboundAt);
  const replies = threads.filter(awaiting);
  const due = threads.filter((t) => !awaiting(t) && t.nextFollowupAt && t.nextFollowupAt < endOfToday);
  const leadIds = [...new Set([...replies, ...due].map((t) => t.leadId))];
  const [profiles, leads] = await Promise.all([
    d.leadSocialProfile.findMany({ where: { leadId: { in: leadIds } } }),
    d.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, businessName: true, decisionMakerName: true } }),
  ]);
  const row = (t: OutreachThread) => {
    const l = leads.find((x) => x.id === t.leadId);
    return {
      name: l?.decisionMakerName || l?.businessName,
      company: l?.decisionMakerName ? l.businessName : null,
      platform: t.platform,
      profile: profiles.find((p) => p.leadId === t.leadId && p.platform === t.platform)?.url ?? null,
      thread_url: t.threadUrl,
      stage: t.stage,
      followups_sent: t.followupCount,
      next_followup_at: iso(t.nextFollowupAt),
      overdue: !!t.nextFollowupAt && t.nextFollowupAt < now,
    };
  };
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const sent: Record<string, { connections: string; dms: string }> = {};
  for (const p of platform ? [platform] : (["linkedin", "facebook", "instagram"] as PlatformId[])) {
    const [lim, s] = await Promise.all([limitsFor(d, me.id, p), sentToday(d, me.id, p)]);
    sent[p] = { connections: `${s.connection}/${lim.connection || "no limit"}`, dms: `${s.dm}/${lim.dm || "no limit"}` };
  }
  return {
    logging_as: me.name,
    sent_today: sent,
    replies_waiting: replies.slice(0, limit).map(row),
    followups_due: due.slice(0, limit).map(row),
  };
}
