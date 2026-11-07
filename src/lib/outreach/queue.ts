// The Social tab's work queue: replies waiting on us (newest inbound first) → overdue
// follow-ups → due today → new not-contacted leads in an active campaign.

import { dayKey } from "@/lib/date";
import { CLOSED_STAGES } from "./platforms";
import { awaitingUs } from "./rules";
import type { OActivity, OCampaign, OThread } from "./types";

export type SocialKind = "reply" | "overdue" | "today" | "new";
export type SocialItem = { thread: OThread; kind: SocialKind; lastActivity: OActivity | null; lastTouch: string | null };

export const SOCIAL_KIND_LABEL: Record<SocialKind, string> = {
  reply: "Replied — your turn",
  overdue: "Follow-up overdue",
  today: "Follow-up due today",
  new: "New — not contacted",
};

const ts = (s: string | null) => (s ? new Date(s).getTime() : 0);

export function buildSocialQueue(
  threads: OThread[],
  activities: OActivity[],
  campaigns: OCampaign[],
  { ownerId, platform, now = Date.now() }: { ownerId?: string; platform?: string; now?: number }
): SocialItem[] {
  const today = dayKey(new Date(now));
  const active = new Set(campaigns.filter((c) => c.status === "active" && (!c.startDate || ts(c.startDate) <= now)).map((c) => c.id));
  const last = new Map<string, OActivity>();
  for (const a of activities) {
    const prev = last.get(a.threadId);
    if (!prev || a.occurredAt > prev.occurredAt) last.set(a.threadId, a);
  }

  const out: (SocialItem & { sort: number })[] = [];
  for (const t of threads) {
    if (ownerId && t.ownerId !== ownerId) continue;
    if (platform && t.platform !== platform) continue;
    const lastActivity = last.get(t.id) ?? null;
    const lastTouch = [t.lastInboundAt, t.lastOutboundAt].filter(Boolean).sort().pop() ?? null;
    const base = { thread: t, lastActivity, lastTouch };
    const closed = CLOSED_STAGES.includes(t.stage);

    if (!closed && awaitingUs(t)) out.push({ ...base, kind: "reply", sort: 0 * 1e15 - ts(t.lastInboundAt) / 1e3 });
    else if (!closed && t.nextFollowupAt && ts(t.nextFollowupAt) <= now && dayKey(t.nextFollowupAt) < today)
      out.push({ ...base, kind: "overdue", sort: 1e15 + ts(t.nextFollowupAt) / 1e3 });
    else if (!closed && t.nextFollowupAt && dayKey(t.nextFollowupAt) === today)
      out.push({ ...base, kind: "today", sort: 2e15 + ts(t.nextFollowupAt) / 1e3 });
    // New: in an active campaign, or added by hand without a campaign (so it doesn't vanish).
    else if (t.stage === "not_contacted" && (t.campaignId ? active.has(t.campaignId) : true))
      out.push({ ...base, kind: "new", sort: 3e15 + ts(t.createdAt) / 1e3 });
  }
  return out.sort((a, b) => a.sort - b.sort).map(({ sort: _s, ...i }) => i);
}

export function daysSince(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 864e5));
}
