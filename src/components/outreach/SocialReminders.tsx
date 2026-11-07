"use client";

// Social follow-up alerts, using the same desktop notification and chime as call reminders:
// `reminderMinutes` before a follow-up, again when it's due, and when a new reply is logged.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquareReply, X } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { PlatformIcon } from "./PlatformIcon";
import { desktopNotify, playChime } from "@/lib/notify";
import { formatTime } from "@/lib/date";
import { CLOSED_STAGES, platformLabel } from "@/lib/outreach/platforms";
import { awaitingUs } from "@/lib/outreach/rules";
import type { OThread } from "@/lib/outreach/types";

type Alert = { key: string; thread: OThread; title: string; at: string };
const TICK_MS = 15_000;
const DUE_GRACE_MS = 15 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;
const storageKey = (u: string) => `scrm_social_reminders:${u}`;

function loadFired(userId: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]") as [string, number][];
    const cutoff = Date.now() - 10 * 864e5;
    return new Map(raw.filter(([, t]) => t > cutoff));
  } catch {
    return new Map<string, number>();
  }
}
function saveFired(userId: string, m: Map<string, number>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...m].slice(-500)));
  } catch {
    /* ignore */
  }
}

export function SocialReminders() {
  const { data: crm, viewer } = useCrm();
  const { data } = useOutreach();
  const { branding } = useBranding();
  const router = useRouter();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const fired = useRef<Map<string, number> | null>(null);
  const snoozed = useRef(new Map<string, number>());
  const leadMs = crm.settings.reminderMinutes * 60 * 1000;

  const openQueue = useCallback(
    (t: OThread) => {
      window.focus();
      router.push(`/loadboard?tab=social&lead=${t.leadId}`);
    },
    [router]
  );

  const tick = useCallback(() => {
    const now = Date.now();
    if (!fired.current) {
      fired.current = loadFired(viewer.id);
      // First run in this browser: don't alert on every old reply at once.
      if (fired.current.size === 0)
        for (const t of data.threads) if (t.lastInboundAt) fired.current.set(`reply|${t.id}|${t.lastInboundAt}`, now);
    }
    const fresh: Alert[] = [];
    for (const t of data.threads) {
      if (t.ownerId !== viewer.id || CLOSED_STAGES.includes(t.stage)) continue;
      if ((snoozed.current.get(t.id) ?? 0) > now) continue;
      let candidate: Alert | null = null;
      if (awaitingUs(t) && t.lastInboundAt && now - new Date(t.lastInboundAt).getTime() < 2 * 864e5) {
        candidate = { key: `reply|${t.id}|${t.lastInboundAt}`, thread: t, title: `${t.leadName} replied on ${platformLabel(t.platform)}`, at: t.lastInboundAt };
      } else if (t.nextFollowupAt) {
        const at = new Date(t.nextFollowupAt).getTime();
        const phase = at <= now ? (now - at <= DUE_GRACE_MS ? "due" : null) : at - now <= leadMs ? "soon" : null;
        if (phase)
          candidate = {
            key: `fu|${t.id}|${t.nextFollowupAt}|${phase}`,
            thread: t,
            title: phase === "due" ? `${platformLabel(t.platform)} follow-up due now` : `${platformLabel(t.platform)} follow-up in ${Math.max(1, Math.round((at - now) / 60000))} min`,
            at: t.nextFollowupAt,
          };
      }
      if (!candidate || fired.current.has(candidate.key)) continue;
      fired.current.set(candidate.key, now);
      fresh.push(candidate);
    }
    if (!fresh.length) return;
    saveFired(viewer.id, fired.current);
    setAlerts((a) => [...a.filter((x) => !fresh.some((f) => f.thread.id === x.thread.id)), ...fresh].slice(-3));
    playChime();
    for (const a of fresh) {
      const n = desktopNotify(a.title, `${a.thread.leadName}${a.thread.company ? ` · ${a.thread.company}` : ""}`, branding.logoDataUrl ?? undefined);
      if (n)
        n.onclick = () => {
          openQueue(a.thread);
          n.close();
        };
    }
  }, [data.threads, viewer.id, leadMs, branding.logoDataUrl, openQueue]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  if (!alerts.length) return null;
  const dismiss = (key: string) => setAlerts((a) => a.filter((x) => x.key !== key));

  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[90] flex w-[min(370px,calc(100vw-32px))] flex-col gap-3" aria-live="polite">
      {alerts.map((a) => {
        const link = a.thread.threadUrl || a.thread.profileUrl;
        return (
          <div key={a.key} role="alert" className="animate-pop-in pointer-events-auto rounded-[20px] bg-white p-5 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.3),0_0_0_1px_rgba(10,10,10,0.06)]">
            <div className="flex items-start gap-3.5">
              <PlatformIcon platform={a.thread.platform} size={40} />
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium">{a.title}</p>
                <p className="mt-1 truncate text-[13px] text-neutral-600">
                  {a.thread.leadName}
                  {a.thread.company && ` · ${a.thread.company}`}
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-500">{formatTime(a.at)}</p>
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(a.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-page hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  openQueue(a.thread);
                  dismiss(a.key);
                }}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-brand text-[13px] text-brand-fg hover:bg-brand-600"
              >
                <MessageSquareReply className="h-4 w-4" /> Open in queue
              </button>
              {link && (
                <a href={link} target="_blank" rel="noreferrer noopener" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-page px-4 text-[13px] hover:bg-neutral-200">
                  <ExternalLink className="h-3.5 w-3.5" /> Thread
                </a>
              )}
              <button
                onClick={() => {
                  snoozed.current.set(a.thread.id, Date.now() + SNOOZE_MS);
                  fired.current?.delete(a.key);
                  dismiss(a.key);
                }}
                className="h-10 rounded-full bg-page px-3 text-[13px] hover:bg-neutral-200"
              >
                Snooze
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
