// Pure rules for the Outreach & Jobs log: how each logged event moves the stage and when the
// next follow-up is due. No I/O here, so it's unit-tested in tests/outreach-log-rules.test.ts.

import type { ContactEvent, ContactStage, JobEvent, JobStage } from "./constants";

const DAY = 864e5;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** Days to wait after each unanswered outbound message: first message → 2d, then 3d, 5d, 7d after each follow-up (3 follow-ups). */
export const CONTACT_CADENCE = [2, 3, 5, 7];
/** Days to wait after applying, then after each follow-up. */
export const JOB_CADENCE = [7, 7];

export type TrackState = {
  stage: string;
  followupCount: number;
  lastOutboundAt: Date | null;
  lastInboundAt: Date | null;
  nextFollowupAt: Date | null;
};

const CONTACT_CLOSED: ContactStage[] = ["won", "lost"];
const CONTACT_ENGAGED: ContactStage[] = ["replied", "interested", "meeting"];
const JOB_CLOSED: JobStage[] = ["hired", "rejected", "withdrawn"];
const JOB_ENGAGED: JobStage[] = ["responded", "interview", "assessment", "offer"];

const rank = <T extends string>(order: readonly T[], s: string) => order.indexOf(s as T);

// ─── Outreach contacts ───────────────────────────────────────

export function applyContactEvent(s: TrackState, ev: ContactEvent, at: Date): TrackState {
  const stage = s.stage as ContactStage;
  if (ev === "note") return s;
  if (ev === "reply") {
    // They answered: we owe a response now.
    return {
      ...s,
      stage: CONTACT_CLOSED.includes(stage) || CONTACT_ENGAGED.includes(stage) ? stage : "replied",
      lastInboundAt: at,
      nextFollowupAt: CONTACT_CLOSED.includes(stage) ? null : at,
    };
  }
  // Outbound: first message or a follow-up.
  if (CONTACT_CLOSED.includes(stage)) return { ...s, lastOutboundAt: at };
  if (CONTACT_ENGAGED.includes(stage)) {
    // Mid-conversation: nudge again in 2 days if they go quiet.
    return { ...s, lastOutboundAt: at, nextFollowupAt: addDays(at, 2) };
  }
  // A first message (or re-opening a cold contact) restarts the cadence; anything after is a follow-up.
  const first = !s.lastOutboundAt || stage === "new" || stage === "no_response";
  const count = first ? 0 : s.followupCount + 1;
  const next: ContactStage = first ? "contacted" : "followed_up";
  return {
    ...s,
    stage: next,
    followupCount: count,
    lastOutboundAt: at,
    nextFollowupAt: addDays(at, CONTACT_CADENCE[Math.min(count, CONTACT_CADENCE.length - 1)]),
  };
}

/** Manual stage change (UI or agent). `meetingAt` sets the follow-up to the day after the meeting. */
export function applyContactStage(s: TrackState, stage: ContactStage, at: Date, meetingAt?: Date | null): TrackState {
  let next: Date | null = s.nextFollowupAt;
  if (stage === "won" || stage === "lost" || stage === "no_response") next = null;
  else if (stage === "meeting") next = meetingAt ? addDays(meetingAt, 1) : addDays(at, 1);
  else if (stage === "interested") next = addDays(at, 2);
  else if (stage === "new") next = null;
  return { ...s, stage, nextFollowupAt: next };
}

// ─── Job applications ────────────────────────────────────────

export function applyJobEvent(s: TrackState, ev: JobEvent, at: Date, opts: { interviewAt?: Date | null } = {}): TrackState {
  const stage = s.stage as JobStage;
  switch (ev) {
    case "note":
      return s;
    case "applied":
      return { ...s, stage: "applied", followupCount: 0, lastOutboundAt: at, nextFollowupAt: addDays(at, JOB_CADENCE[0]) };
    case "followup": {
      if (JOB_CLOSED.includes(stage)) return { ...s, lastOutboundAt: at };
      if (JOB_ENGAGED.includes(stage)) return { ...s, lastOutboundAt: at, nextFollowupAt: addDays(at, 3) };
      const count = s.followupCount + 1;
      return {
        ...s,
        stage: "followed_up",
        followupCount: count,
        lastOutboundAt: at,
        nextFollowupAt: addDays(at, JOB_CADENCE[Math.min(count, JOB_CADENCE.length - 1)]),
      };
    }
    case "response":
      return {
        ...s,
        stage: JOB_CLOSED.includes(stage) || rank(JOB_ENGAGED, stage) > 0 ? stage : "responded",
        lastInboundAt: at,
        nextFollowupAt: JOB_CLOSED.includes(stage) ? null : at,
      };
    case "interview": {
      const when = opts.interviewAt ?? null;
      // Follow up (thank-you / status check) the day after the interview.
      return { ...s, stage: "interview", lastInboundAt: at, nextFollowupAt: addDays(when ?? at, 1) };
    }
    case "assessment":
      return { ...s, stage: "assessment", lastInboundAt: at, nextFollowupAt: addDays(at, 3) };
    case "offer":
      return { ...s, stage: "offer", lastInboundAt: at, nextFollowupAt: addDays(at, 2) };
    case "rejected":
      return { ...s, stage: "rejected", lastInboundAt: at, nextFollowupAt: null };
  }
}

export function applyJobStage(s: TrackState, stage: JobStage, at: Date): TrackState {
  if (JOB_CLOSED.includes(stage) || stage === "ghosted" || stage === "saved") return { ...s, stage, nextFollowupAt: null };
  if (stage === "applied" && !s.lastOutboundAt) return applyJobEvent(s, "applied", at);
  if (stage === "offer") return { ...s, stage, nextFollowupAt: addDays(at, 2) };
  return { ...s, stage };
}

// ─── Going cold ──────────────────────────────────────────────

/**
 * When the last follow-up in the cadence went unanswered and its wait is over, the contact
 * becomes "no_response" (jobs: "ghosted") and stops asking for follow-ups. Returns null when
 * nothing changes.
 */
export function expireContact(s: TrackState, now: Date): TrackState | null {
  if (!["contacted", "followed_up"].includes(s.stage)) return null;
  if (s.followupCount < CONTACT_CADENCE.length - 1) return null;
  if (!s.nextFollowupAt || s.nextFollowupAt > now) return null;
  if (s.lastInboundAt && s.lastOutboundAt && s.lastInboundAt >= s.lastOutboundAt) return null;
  return { ...s, stage: "no_response", nextFollowupAt: null };
}

export function expireJob(s: TrackState, now: Date): TrackState | null {
  if (!["applied", "followed_up"].includes(s.stage)) return null;
  if (s.followupCount < JOB_CADENCE.length) return null;
  if (!s.nextFollowupAt || s.nextFollowupAt > now) return null;
  if (s.lastInboundAt && s.lastOutboundAt && s.lastInboundAt >= s.lastOutboundAt) return null;
  return { ...s, stage: "ghosted", nextFollowupAt: null };
}

/** True when the other side spoke last — a reply is waiting on us. */
export const awaitingUs = (s: Pick<TrackState, "lastInboundAt" | "lastOutboundAt">) =>
  !!s.lastInboundAt && (!s.lastOutboundAt || s.lastInboundAt > s.lastOutboundAt);

/** Stable key for duplicate checks: phone digits, lower-case email, or a trimmed URL/handle. */
export function handleKey(channel: string, handle: string): string {
  const h = handle.trim().toLowerCase();
  if (!h) return "";
  if (channel === "whatsapp" || channel === "phone") return h.replace(/[^\d]/g, "").replace(/^00/, "");
  if (channel === "email") return h;
  return h
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.|m\.|mobile\.)/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^@/, "");
}
