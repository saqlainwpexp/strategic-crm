// Template-based helpers behind the dashboard's "Intelligent Box".
// Deterministic and data-driven; can later be swapped for an LLM call.

import type { CrmData, Lead, Meeting, User } from "./types";
import { CONNECT_DISPOSITIONS, DEAL_STAGES, OPEN_STAGES, tempFromScore } from "./constants";
import { dayKey, dayLabel, formatTime, todayKey } from "./date";
import { compactMoney, formatDuration, sum } from "./utils";

const firstName = (name: string) => name.replace(/^Dr\.\s*/, "").split(" ")[0];
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

export type Suggestion = { lead: Lead; reasons: string[] };

/** Rank callable leads: score, due follow-ups and priority up; already-called-today down. */
export function suggestLeads(data: CrmData, limit = 3): Suggestion[] {
  const now = new Date().toISOString();
  const today = todayKey();
  const calledToday = new Set(data.calls.filter((c) => dayKey(c.startedAt) === today).map((c) => c.leadId));
  const callable = data.leads.filter(
    (l) => OPEN_STAGES.includes(l.stage) && l.stage !== "MEETING_BOOKED" && l.stage !== "SHOWED"
  );

  return callable
    .map((lead) => {
      const reasons: string[] = [];
      let rank = lead.leadScore;
      const temp = tempFromScore(lead.leadScore, data.settings.hotThreshold, data.settings.warmThreshold);
      if (temp === "HOT") reasons.push(`Hot lead — score ${lead.leadScore}/100`);
      if (lead.nextFollowUpAt && lead.nextFollowUpAt <= now) {
        rank += 30;
        reasons.push(dayKey(lead.nextFollowUpAt) === today ? "Follow-up is due now" : "Follow-up is overdue");
      } else if (lead.nextFollowUpAt && dayKey(lead.nextFollowUpAt) === today) {
        rank += 15;
        reasons.push(`Asked for a call today at ${formatTime(lead.nextFollowUpAt)}`);
      }
      if (lead.priority === "HIGH") {
        rank += 10;
        reasons.push("Marked high priority");
      }
      if (lead.stage === "INTERESTED") {
        rank += 12;
        reasons.push("Already showed interest");
      }
      if (lead.stage === "NO_SHOW") {
        rank += 8;
        reasons.push("Missed their meeting — rebook");
      }
      if (calledToday.has(lead.id)) rank -= 40;
      if (!reasons.length) reasons.push(`Score ${lead.leadScore}/100 · ${lead.service} opportunity`);
      reasons.push(`Est. value ${compactMoney(lead.estimatedValue)}`);
      return { lead, reasons, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(({ lead, reasons }) => ({ lead, reasons }));
}

/** Candidates for an email draft: warm conversations first. */
export function emailCandidates(data: CrmData): Lead[] {
  const order = ["INTERESTED", "MEETING_BOOKED", "SHOWED", "CONTACTED", "CALL_ME_LATER", "NO_SHOW"];
  return data.leads
    .filter((l) => order.includes(l.stage) && l.email)
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage) || b.leadScore - a.leadScore)
    .slice(0, 8);
}

export function draftEmail(lead: Lead, sender: User, agencyName: string) {
  const issues = lines(lead.issues);
  const solutions = lines(lead.suggestedServices);
  const industry = String(lead.customFields.industry ?? "local").toLowerCase();
  const opener = lead.lastContactedAt
    ? "Thanks for your time on the phone. As promised, here's a quick summary of what we discussed:"
    : `I came across ${lead.businessName} and had a quick idea I wanted to share:`;

  const subject = `A quick idea for ${lead.businessName}`;
  const body = [
    `Hi ${firstName(lead.decisionMakerName)},`,
    "",
    opener,
    "",
    "What we noticed",
    ...issues.map((i) => `• ${i}`),
    "",
    "What we'd suggest",
    ...solutions.map((s) => `• ${s}`),
    "",
    `Most ${industry} businesses we work with in ${lead.city} start seeing more enquiries within the first few weeks. Would you be open to a 15-minute call this week so I can walk you through a couple of examples?`,
    "",
    "Best regards,",
    sender.name,
    agencyName,
  ].join("\n");
  return { subject, body };
}

export function nextMeeting(data: CrmData): { meeting: Meeting; lead: Lead } | null {
  const now = new Date().toISOString();
  for (const m of data.meetings) {
    if (m.status !== "BOOKED" || m.scheduledAt < now) continue;
    const lead = data.leads.find((l) => l.id === m.leadId);
    if (lead) return { meeting: m, lead };
  }
  return null;
}

export function reminderMessage(meeting: Meeting, lead: Lead, rep: User | undefined, agencyName: string) {
  const label = dayLabel(dayKey(meeting.scheduledAt));
  const when = label === "Today" || label === "Tomorrow" ? label.toLowerCase() : `on ${label}`;
  return `Hi ${firstName(lead.decisionMakerName)}, this is ${firstName(rep?.name ?? "the team")} from ${agencyName}. Just a quick reminder about our ${meeting.title.toLowerCase()} ${when} at ${formatTime(meeting.scheduledAt)}. If you need to reschedule, just reply here. Looking forward to speaking with you!`;
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Quick answers to common questions, computed from the viewer's data. */
export function answer(question: string, data: CrmData): string[] {
  const q = question.toLowerCase();
  const today = todayKey();
  const now = new Date().toISOString();

  if (/call/.test(q)) {
    const todays = data.calls.filter((c) => dayKey(c.startedAt) === today);
    const connected = todays.filter((c) => CONNECT_DISPOSITIONS.includes(c.disposition));
    return [
      `${todays.length} calls made today.`,
      `${connected.length} connected (${todays.length ? Math.round((connected.length / todays.length) * 100) : 0}% connect rate).`,
      `${formatDuration(sum(todays.map((c) => c.durationSec)))} total talk time.`,
    ];
  }
  if (/hot/.test(q)) {
    const hot = data.leads
      .filter((l) => OPEN_STAGES.includes(l.stage) && l.leadScore >= data.settings.hotThreshold)
      .sort((a, b) => b.leadScore - a.leadScore);
    return [
      `${hot.length} hot leads (score ${data.settings.hotThreshold}+).`,
      ...hot.slice(0, 3).map((l) => `${l.businessName} — ${l.leadScore}`),
    ];
  }
  if (/follow/.test(q)) {
    const due = data.leads.filter((l) => l.nextFollowUpAt && dayKey(l.nextFollowUpAt) === today && OPEN_STAGES.includes(l.stage));
    const overdue = data.leads.filter(
      (l) => l.nextFollowUpAt && l.nextFollowUpAt < now && dayKey(l.nextFollowUpAt) !== today && OPEN_STAGES.includes(l.stage)
    );
    return [`${due.length} follow-ups due today.`, `${overdue.length} overdue from earlier days.`];
  }
  if (/meeting/.test(q)) {
    const todays = data.meetings.filter((m) => m.status === "BOOKED" && dayKey(m.scheduledAt) === today);
    return [
      `${todays.length} meeting${todays.length === 1 ? "" : "s"} booked for today.`,
      ...todays.slice(0, 4).map((m) => `${formatTime(m.scheduledAt)} — ${m.title}, ${data.leads.find((l) => l.id === m.leadId)?.businessName ?? ""}`),
    ];
  }
  if (/revenue|payment|sale|paid|money/.test(q)) {
    const month = today.slice(0, 7);
    const paid = data.payments.filter((p) => p.status === "PAID" && p.paidAt && dayKey(p.paidAt).startsWith(month));
    const pending = data.payments.filter((p) => p.status === "PENDING" || p.status === "PARTIAL");
    return [
      `${compactMoney(sum(paid.map((p) => p.amount)))} collected this month.`,
      `${compactMoney(sum(pending.map((p) => p.amount)))} outstanding across ${pending.length} invoice${pending.length === 1 ? "" : "s"}.`,
    ];
  }
  if (/pipeline|deal/.test(q)) {
    const deals = data.leads.filter((l) => DEAL_STAGES.includes(l.stage));
    return [`${deals.length} active deals worth ${compactMoney(sum(deals.map((l) => l.estimatedValue)))}.`];
  }
  return [
    "I can answer questions about your calls, hot leads, follow-ups, meetings, revenue and pipeline.",
    "Try: “How many calls today?” or “Which leads are hot?”",
  ];
}
