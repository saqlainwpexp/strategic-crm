// Business rules for social outreach — pure functions, shared by the server (which saves the
// result) and the browser (queue ordering). Unit-tested in tests/outreach-rules.test.ts.

import { CLOSED_STAGES, OUTREACH_STAGES, type OutreachActivityType, type OutreachStage } from "./platforms";

const DAY = 24 * 60 * 60 * 1000;

/** Days to wait for a reply after the first DM, follow-up 1, follow-up 2 and follow-up 3. */
export const FOLLOWUP_DAYS = [3, 5, 7, 7];
/** Days after a connection is accepted before the first DM is due. */
export const AFTER_ACCEPT_DAYS = 2;
/** Follow-ups (DMs after the first) before a silent thread is marked no_response. */
export const MAX_FOLLOWUPS = 3;

export type ThreadState = {
  stage: OutreachStage;
  connectionSentAt: Date | null;
  connectionAcceptedAt: Date | null;
  firstMessageAt: Date | null;
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
  followupCount: number;
  nextFollowupAt: Date | null;
};

export type ActivityInput = {
  direction: "outbound" | "inbound";
  type: OutreachActivityType;
  occurredAt: Date;
};

/** Activity types that count as sending a message (DM limit, stage message_sent). */
export const MESSAGE_TYPES: OutreachActivityType[] = ["dm", "voice_note", "story_reply"];

export function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * DAY);
}

const rank = (s: OutreachStage) => OUTREACH_STAGES.indexOf(s);

/** Moves forward only through the "working" stages; never pulls a thread backwards. */
function forward(current: OutreachStage, next: OutreachStage): OutreachStage {
  if (CLOSED_STAGES.includes(current) && current !== "no_response") return current;
  if (current === "no_response") return next; // they came back to life
  return rank(next) > rank(current) ? next : current;
}

/** The new thread state after logging one activity. */
export function applyActivity(t: ThreadState, a: ActivityInput): ThreadState {
  const at = a.occurredAt;
  const s: ThreadState = { ...t };

  if (a.direction === "inbound") {
    s.lastInboundAt = at;
    s.nextFollowupAt = null; // the ball is in our court — the queue shows it as a reply waiting
    if (!["interested", "call_booked", "won"].includes(s.stage)) s.stage = "replied";
    return s;
  }

  s.lastOutboundAt = at;
  if (a.type === "connection_request") {
    s.connectionSentAt ??= at;
    s.stage = forward(s.stage, "connection_sent");
    return s;
  }

  if (MESSAGE_TYPES.includes(a.type)) {
    const replied = !!s.lastInboundAt && (!t.lastOutboundAt || s.lastInboundAt >= t.lastOutboundAt);
    if (!s.firstMessageAt) s.firstMessageAt = at;
    else if (!replied) s.followupCount += 1;
    // A reply resets the follow-up chain: we are now in a conversation.
    if (replied) s.followupCount = 0;
    s.stage = forward(s.stage, "message_sent");
    if (["interested", "call_booked", "won", "lost", "not_interested"].includes(s.stage)) {
      s.nextFollowupAt = null;
    } else {
      const wait = FOLLOWUP_DAYS[Math.min(s.followupCount, FOLLOWUP_DAYS.length - 1)];
      s.nextFollowupAt = addDays(at, wait);
    }
  }
  // comment / like: a touch, nothing else changes.
  return s;
}

/** Changing the stage by hand (inline stage picker, quick-log buttons). */
export function applyStage(t: ThreadState, stage: OutreachStage, now: Date): ThreadState {
  const s: ThreadState = { ...t, stage };
  if (stage === "connected") {
    s.connectionAcceptedAt ??= now;
    s.nextFollowupAt = addDays(s.connectionAcceptedAt, AFTER_ACCEPT_DAYS);
  }
  if (CLOSED_STAGES.includes(stage) || stage === "interested" || stage === "call_booked") s.nextFollowupAt = null;
  return s;
}

/**
 * A thread whose last follow-up went unanswered past its wait becomes no_response.
 * Returns null when nothing changes.
 */
export function expireIfSilent(t: ThreadState, now: Date): ThreadState | null {
  if (t.stage !== "message_sent" || t.followupCount < MAX_FOLLOWUPS || !t.nextFollowupAt) return null;
  if (t.nextFollowupAt > now) return null;
  if (t.lastInboundAt && t.lastOutboundAt && t.lastInboundAt >= t.lastOutboundAt) return null;
  return { ...t, stage: "no_response", nextFollowupAt: null };
}

/** True when they wrote last and we haven't answered. */
export function awaitingUs(t: { lastInboundAt: Date | string | null; lastOutboundAt: Date | string | null }) {
  if (!t.lastInboundAt) return false;
  return !t.lastOutboundAt || new Date(t.lastInboundAt).getTime() > new Date(t.lastOutboundAt).getTime();
}

// ─── Pipeline ────────────────────────────────────────────────

/** Lead pipeline stages a social stage may move a lead *out of* (never pulls a lead back). */
const EARLY_LEAD_STAGES = ["LEAD", "CONTACTED", "CALL_ME_LATER"];

/** Which Lead pipeline stage (if any) a thread stage should push the lead to. */
export function pipelineStageFor(stage: OutreachStage, leadStage: string): string | null {
  if (stage === "interested") return EARLY_LEAD_STAGES.includes(leadStage) ? "INTERESTED" : null;
  if (stage === "call_booked") return [...EARLY_LEAD_STAGES, "INTERESTED", "NO_SHOW"].includes(leadStage) ? "MEETING_BOOKED" : null;
  if (stage === "won") return leadStage === "CLOSED_WON" ? null : "CLOSED_WON";
  if (["message_sent", "replied", "connected", "connection_sent"].includes(stage)) return leadStage === "LEAD" ? "CONTACTED" : null;
  return null;
}

// ─── Daily limits ────────────────────────────────────────────

export type LimitStatus = "ok" | "warn" | "block";

/** Warn at 80% of the limit, block at 100%. A limit of 0 means "no limit". */
export function limitStatus(sentToday: number, limit: number): LimitStatus {
  if (!limit || limit <= 0) return "ok";
  if (sentToday >= limit) return "block";
  if (sentToday >= Math.ceil(limit * 0.8)) return "warn";
  return "ok";
}

/** Which limit an outbound activity counts against. */
export function limitKind(type: OutreachActivityType): "connection" | "dm" | null {
  if (type === "connection_request") return "connection";
  if (MESSAGE_TYPES.includes(type)) return "dm";
  return null;
}

// ─── Templates ───────────────────────────────────────────────

export type MergeLead = { decisionMakerName?: string | null; businessName?: string | null; jobTitle?: string | null };

/** Fills {first_name} {last_name} {full_name} {company} {job_title}. */
export function mergeTemplate(body: string, lead: MergeLead): string {
  const full = (lead.decisionMakerName ?? "").trim();
  const [first = "", ...rest] = full.split(/\s+/);
  const values: Record<string, string> = {
    first_name: first || "there",
    last_name: rest.join(" "),
    full_name: full,
    company: (lead.businessName ?? "").trim() || "your company",
    job_title: (lead.jobTitle ?? "").trim(),
  };
  return body.replace(/\{\s*(\w+)\s*\}/g, (m, k: string) => (k.toLowerCase() in values ? values[k.toLowerCase()] : m));
}
