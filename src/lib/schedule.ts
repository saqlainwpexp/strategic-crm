import type { CrmData, Lead, Meeting } from "./types";
import { dayKey } from "./date";

export type ScheduleEntry = {
  id: string;
  kind: "meeting" | "followup";
  at: string;
  title: string;
  lead: Lead;
  userId: string | null;
  meeting?: Meeting;
  icon: "call" | "meeting" | "proposal" | "onboarding";
};

const CLOSED = new Set(["CLOSED_WON", "NOT_INTERESTED"]);

/** Meetings and follow-up calls for a given day key, sorted by time. */
export function scheduleFor(data: CrmData, day: string): ScheduleEntry[] {
  const leadMap = new Map(data.leads.map((l) => [l.id, l]));
  const out: ScheduleEntry[] = [];

  for (const m of data.meetings) {
    if (m.status === "CANCELLED" || dayKey(m.scheduledAt) !== day) continue;
    const lead = leadMap.get(m.leadId);
    if (!lead) continue;
    out.push({
      id: m.id,
      kind: "meeting",
      at: m.scheduledAt,
      title: m.title,
      lead,
      userId: m.userId,
      meeting: m,
      icon: m.type === "PROPOSAL" ? "proposal" : m.type === "ONBOARDING" ? "onboarding" : "meeting",
    });
  }

  for (const lead of data.leads) {
    if (!lead.nextFollowUpAt || CLOSED.has(lead.stage) || dayKey(lead.nextFollowUpAt) !== day) continue;
    out.push({
      id: `fu_${lead.id}`,
      kind: "followup",
      at: lead.nextFollowUpAt,
      title: "Follow-up Call",
      lead,
      userId: lead.assignedToId,
      icon: "call",
    });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Set of day keys (within `days`) that have at least one entry. */
export function busyDays(data: CrmData, days: string[]): Set<string> {
  const wanted = new Set(days);
  const busy = new Set<string>();
  for (const m of data.meetings) {
    const k = dayKey(m.scheduledAt);
    if (m.status !== "CANCELLED" && wanted.has(k)) busy.add(k);
  }
  for (const l of data.leads) {
    if (!l.nextFollowUpAt || CLOSED.has(l.stage)) continue;
    const k = dayKey(l.nextFollowUpAt);
    if (wanted.has(k)) busy.add(k);
  }
  return busy;
}
