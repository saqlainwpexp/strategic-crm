// Call queue for the Loadboard: which lead to dial next, and why.

import type { CrmData, Lead } from "./types";
import { tempFromScore } from "./constants";
import { dayKey, dayLabel, formatTime } from "./date";
import { compactMoney } from "./utils";

export type QueueKind = "callback" | "rebook" | "interested" | "hot" | "new" | "retry";

export type QueueItem = {
  lead: Lead;
  kind: QueueKind;
  /** Short reason shown on the card, e.g. "Callback due 2:30 PM". */
  reason: string;
  attempts: number;
  rank: number;
};

export const QUEUE_KIND_LABELS: Record<QueueKind, string> = {
  callback: "Callback",
  rebook: "Rebook",
  interested: "Interested",
  hot: "Hot lead",
  new: "New lead",
  retry: "Retry",
};

/** Stages that never go back in the dialling queue. */
const EXCLUDED = new Set(["MEETING_BOOKED", "SHOWED", "NOT_INTERESTED", "CLOSED_WON"]);
/** Don't redial a lead within this long of the last call, unless its callback is due. */
const COOLDOWN_MS = 3 * 60 * 60 * 1000;
/** A scheduled callback enters the queue this long before it's due. */
const CALLBACK_WINDOW_MS = 30 * 60 * 1000;

export function buildQueue(
  data: CrmData,
  { ownerId, skipped = [], now = Date.now() }: { ownerId?: string | null; skipped?: string[]; now?: number }
): QueueItem[] {
  const attempts = new Map<string, number>();
  for (const c of data.calls) attempts.set(c.leadId, (attempts.get(c.leadId) ?? 0) + 1);

  const items: QueueItem[] = [];
  for (const lead of data.leads) {
    if (EXCLUDED.has(lead.stage)) continue;
    if (ownerId !== undefined && lead.assignedToId !== ownerId) continue;

    const due = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : null;
    const last = lead.lastContactedAt ? new Date(lead.lastContactedAt).getTime() : null;
    const callbackDue = due !== null && due <= now + CALLBACK_WINDOW_MS;
    // Scheduled for later → it's in the follow-ups sidebar, not the queue.
    if (due !== null && !callbackDue) continue;
    if (!callbackDue && last !== null && now - last < COOLDOWN_MS) continue;

    const n = attempts.get(lead.id) ?? 0;
    const temp = tempFromScore(lead.leadScore, data.settings.hotThreshold, data.settings.warmThreshold);
    let kind: QueueKind;
    let reason: string;
    let rank: number;

    if (callbackDue) {
      const overdueMin = Math.round((now - due!) / 60000);
      kind = "callback";
      rank = 1000 + Math.min(overdueMin, 600);
      reason =
        due! > now
          ? `Callback at ${formatTime(lead.nextFollowUpAt!)}`
          : dayKey(lead.nextFollowUpAt!) === dayKey(new Date(now))
            ? `Callback was due ${formatTime(lead.nextFollowUpAt!)}`
            : `Overdue callback · ${dayLabel(dayKey(lead.nextFollowUpAt!))}`;
    } else if (lead.stage === "NO_SHOW") {
      kind = "rebook";
      rank = 700 + lead.leadScore;
      reason = "Missed their meeting — rebook";
    } else if (lead.stage === "INTERESTED") {
      kind = "interested";
      rank = 600 + lead.leadScore;
      reason = `Showed interest · ${compactMoney(lead.estimatedValue)} ${lead.service}`;
    } else if (temp === "HOT") {
      kind = "hot";
      rank = 400 + lead.leadScore;
      reason = `Hot lead · score ${lead.leadScore}`;
    } else if (lead.stage === "LEAD" && n === 0) {
      kind = "new";
      rank = 300 + lead.leadScore;
      reason = "New lead — never called";
    } else {
      kind = "retry";
      rank = 150 + lead.leadScore - n * 6;
      reason = n ? `Retry · ${n} attempt${n === 1 ? "" : "s"} so far` : "Ready to call";
    }
    if (lead.priority === "HIGH") rank += 40;
    else if (lead.priority === "MEDIUM") rank += 15;

    items.push({ lead, kind, reason, attempts: n, rank });
  }

  items.sort((a, b) => b.rank - a.rank);
  if (!skipped.length) return items;
  // Skipped leads move to the back, in the order they were skipped.
  const skip = new Set(skipped);
  return [...items.filter((i) => !skip.has(i.lead.id)), ...skipped.map((id) => items.find((i) => i.lead.id === id)).filter((i): i is QueueItem => !!i)];
}

export type UpcomingItem = {
  id: string;
  kind: "followup" | "meeting";
  at: string;
  title: string;
  lead: Lead;
  userId: string | null;
};

/** Scheduled callbacks and meetings from now on, soonest first. */
export function upcomingFor(data: CrmData, { ownerId, now = Date.now(), days = 7 }: { ownerId?: string | null; now?: number; days?: number }) {
  const from = new Date(now - 5 * 60 * 1000).toISOString();
  const until = new Date(now + days * 864e5).toISOString();
  const leadMap = new Map(data.leads.map((l) => [l.id, l]));
  const out: UpcomingItem[] = [];

  for (const l of data.leads) {
    if (!l.nextFollowUpAt || EXCLUDED.has(l.stage)) continue;
    if (ownerId !== undefined && l.assignedToId !== ownerId) continue;
    if (l.nextFollowUpAt < from || l.nextFollowUpAt > until) continue;
    out.push({ id: `fu_${l.id}`, kind: "followup", at: l.nextFollowUpAt, title: "Follow-up call", lead: l, userId: l.assignedToId });
  }
  for (const m of data.meetings) {
    if (m.status !== "BOOKED" || m.scheduledAt < from || m.scheduledAt > until) continue;
    if (ownerId !== undefined && m.userId !== ownerId) continue;
    const lead = leadMap.get(m.leadId);
    if (lead) out.push({ id: m.id, kind: "meeting", at: m.scheduledAt, title: m.title, lead, userId: m.userId });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
