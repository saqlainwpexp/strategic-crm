"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, Check, Copy, ExternalLink, MessageSquareReply, Send, ThumbsDown, ThumbsUp, UserPlus, UserCheck } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { PlatformIcon } from "./PlatformIcon";
import { StageBadge } from "./StageBadge";
import { Input } from "@/components/ui/Form";
import { quickLogAction } from "@/server/outreach/actions";
import { mergeTemplate } from "@/lib/outreach/rules";
import { platformDef, platformLabel } from "@/lib/outreach/platforms";
import { SOCIAL_KIND_LABEL, daysSince, type SocialItem } from "@/lib/outreach/queue";
import type { OThread, OTemplate, QuickLogKind } from "@/lib/outreach/types";
import { shiftDayKey, todayKey, zonedISO } from "@/lib/date";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<SocialItem["kind"], string> = {
  reply: "bg-rose-50 text-[#C9373C]",
  overdue: "bg-amber-50 text-amber-700",
  today: "bg-brand-50 text-brand-700",
  new: "bg-page text-neutral-600",
};

/** Templates that fit this thread: its own, its campaign's, then any active one for the platform. */
export function templatesFor(thread: OThread, templates: OTemplate[], campaignTemplateId?: string | null) {
  const usable = templates.filter((t) => t.active && (t.platform === thread.platform || t.platform === "any"));
  const first = [thread.templateId, campaignTemplateId].filter(Boolean) as string[];
  return [...first.map((id) => templates.find((t) => t.id === id)).filter((t): t is OTemplate => !!t), ...usable.filter((t) => !first.includes(t.id))];
}

export function mergeFor(thread: OThread, body: string) {
  return mergeTemplate(body, {
    decisionMakerName: thread.company ? thread.leadName : "",
    businessName: thread.company || thread.leadName,
    jobTitle: thread.jobTitle,
  });
}

/** Local datetime-input value for tomorrow 10:00 in the CRM's time zone. */
function defaultMeeting() {
  const d = new Date(zonedISO(shiftDayKey(todayKey(), 1), 10));
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function useQuickLog() {
  const { act, patchThread } = useOutreach();
  const { perms } = useCrm();
  return async (thread: OThread, kind: QuickLogKind, opts: { note?: string; meetingAt?: string | null } = {}) => {
    const optimistic: Partial<Record<QuickLogKind, Partial<OThread>>> = {
      sent_connection: { stage: "connection_sent" },
      accepted: { stage: "connected" },
      sent_dm: { stage: thread.stage === "replied" ? "replied" : "message_sent", lastOutboundAt: new Date().toISOString() },
      replied: { stage: "replied", lastInboundAt: new Date().toISOString() },
      interested: { stage: "interested" },
      booked: { stage: "call_booked" },
      not_interested: { stage: "not_interested" },
      won: { stage: "won" },
    };
    const label: Record<QuickLogKind, string> = {
      sent_connection: "Connection request logged",
      accepted: "Marked as connected",
      sent_dm: "DM logged",
      replied: "Reply logged",
      interested: "Marked interested — lead moved in Pipeline",
      booked: "Call booked — added to Schedule",
      not_interested: "Marked not interested",
      won: "Marked won",
    };
    const before = { ...thread };
    patchThread(thread.id, optimistic[kind] ?? {});
    const input = { threadId: thread.id, kind, note: opts.note || undefined, meetingAt: opts.meetingAt ?? null };
    let res = await act(quickLogAction(input), label[kind]);
    if (!res.ok && "code" in res && res.code === "limit" && perms.manageUsers) {
      if (window.confirm(`${res.error}\n\nSend anyway with admin override?`)) res = await act(quickLogAction({ ...input, override: true }), label[kind]);
    }
    if (!res.ok) patchThread(thread.id, before);
    return res.ok;
  };
}

export function SocialCard({ item, showOwner }: { item: SocialItem; showOwner?: boolean }) {
  const { thread } = item;
  const { data } = useOutreach();
  const { userById, notify } = useCrm();
  const log = useQuickLog();
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const campaign = data.campaigns.find((c) => c.id === thread.campaignId);
  const templates = useMemo(() => templatesFor(thread, data.templates, campaign?.templateId), [thread, data.templates, campaign?.templateId]);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const days = daysSince(item.lastTouch);
  const link = thread.threadUrl || thread.profileUrl;
  const def = platformDef(thread.platform);

  const run = async (kind: QuickLogKind, meetingAt?: string) => {
    setBusy(true);
    const ok = await log(thread, kind, { note, meetingAt: meetingAt ? new Date(meetingAt).toISOString() : null });
    setBusy(false);
    if (ok) {
      setNote("");
      setBooking(null);
    }
  };

  const copy = async () => {
    const t = templates.find((x) => x.id === templateId);
    if (!t) return notify("No template for this platform yet — add one in Admin → Social.", "error");
    try {
      await navigator.clipboard.writeText(mergeFor(thread, t.body));
      notify(`"${t.name}" copied`);
    } catch {
      notify("Your browser blocked the clipboard.", "error");
    }
  };

  const buttons: { kind: QuickLogKind; label: string; icon: typeof Send; show: boolean }[] = [
    { kind: "sent_connection", label: "Sent connection", icon: UserPlus, show: !!def?.hasConnections && ["not_contacted", "no_response"].includes(thread.stage) },
    { kind: "accepted", label: "Accepted", icon: UserCheck, show: thread.stage === "connection_sent" },
    { kind: "sent_dm", label: "Sent DM", icon: Send, show: true },
    { kind: "replied", label: "They replied", icon: MessageSquareReply, show: true },
    { kind: "interested", label: "Interested", icon: ThumbsUp, show: !["interested", "call_booked", "won"].includes(thread.stage) },
    { kind: "booked", label: "Booked", icon: CalendarCheck2, show: thread.stage !== "won" },
    { kind: "not_interested", label: "Not interested", icon: ThumbsDown, show: !["not_interested", "won"].includes(thread.stage) },
  ];

  return (
    <article className="rounded-[20px] bg-white p-6">
      <div className="flex flex-wrap items-start gap-4">
        <PlatformIcon platform={thread.platform} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="truncate text-[16px] font-medium">{thread.leadName}</h3>
            <StageBadge stage={thread.stage} />
            <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px]", KIND_TONE[item.kind])}>{SOCIAL_KIND_LABEL[item.kind]}</span>
          </div>
          <p className="mt-1 truncate text-[13px] text-neutral-500">
            {[thread.jobTitle, thread.company].filter(Boolean).join(" · ") || platformLabel(thread.platform)}
            {campaign && <> · {campaign.name}</>}
            {showOwner && thread.ownerId && <> · {userById(thread.ownerId)?.name ?? "—"}</>}
          </p>
        </div>
        <div className="text-right text-[12px] text-neutral-500">
          <p className="tabular-nums">{days === null ? "Never touched" : days === 0 ? "Touched today" : `${days}d since last touch`}</p>
          {thread.followupCount > 0 && <p className="mt-0.5">Follow-up {thread.followupCount}/3</p>}
        </div>
      </div>

      {item.lastActivity?.messageText && (
        <p className={cn("mt-4 line-clamp-2 rounded-2xl px-4 py-3 text-[13px] leading-relaxed", item.lastActivity.direction === "inbound" ? "bg-rose-50/60 text-ink" : "bg-soft text-neutral-600")}>
          <span className="mr-1.5 text-neutral-400">{item.lastActivity.direction === "inbound" ? "They:" : "You:"}</span>
          {item.lastActivity.messageText}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a
          href={link || undefined}
          target="_blank"
          rel="noreferrer noopener"
          aria-disabled={!link}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] text-white hover:bg-ink-muted", !link && "pointer-events-none opacity-40")}
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open thread
        </a>
        {templates.length > 1 && (
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="h-9 max-w-[180px] cursor-pointer rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px]">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <button onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-4 text-[13px] hover:bg-neutral-50">
          <Copy className="h-3.5 w-3.5" /> Copy template
        </button>
      </div>

      <div className="mt-5 border-t border-neutral-100 pt-5">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note or message text, then click what happened" className="h-10 text-[13px]" />
        <div className="mt-3 flex flex-wrap gap-2">
          {buttons
            .filter((b) => b.show)
            .map((b) => (
              <button
                key={b.kind}
                disabled={busy}
                onClick={() => (b.kind === "booked" ? setBooking(booking ? null : defaultMeeting()) : run(b.kind))}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] transition-colors disabled:opacity-50",
                  b.kind === "booked" && booking !== null ? "bg-emerald-600 text-white" : "bg-page text-ink hover:bg-neutral-200/80"
                )}
              >
                <b.icon className="h-3.5 w-3.5" /> {b.label}
              </button>
            ))}
        </div>
        {booking !== null && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-emerald-50/70 p-3">
            <span className="text-[12.5px] text-emerald-800">Call time</span>
            <input type="datetime-local" value={booking} onChange={(e) => setBooking(e.target.value)} className="h-9 rounded-full border border-black/[0.08] bg-white px-3 text-[13px]" />
            <button disabled={busy || !booking} onClick={() => run("booked", booking)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-[12.5px] text-white disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> Book call
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
