"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, PhoneCall, Video, X } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { upcomingFor, type UpcomingItem } from "@/lib/queue";
import { dialHref } from "@/lib/dial";
import { formatTime } from "@/lib/date";
import { desktopNotify, playChime } from "@/lib/notify";

type Phase = "soon" | "due";
type Reminder = { key: string; item: UpcomingItem; phase: Phase };

const TICK_MS = 15_000;
/** A "due" reminder still fires if the page is opened up to this long after the time. */
const DUE_GRACE_MS = 15 * 60 * 1000;
const SNOOZE_MS = 10 * 60 * 1000;

function storageKey(userId: string) {
  return `scrm_reminders:${userId}`;
}

function loadFired(userId: string): Map<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]") as [string, number][];
    const cutoff = Date.now() - 2 * 864e5;
    return new Map(raw.filter(([, t]) => t > cutoff));
  } catch {
    return new Map();
  }
}

function saveFired(userId: string, fired: Map<string, number>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...fired]));
  } catch {
    /* ignore */
  }
}

/**
 * Watches the signed-in rep's follow-up calls and meetings and raises a reminder
 * `settings.reminderMinutes` before each one and again when it's due.
 */
export function ReminderCenter() {
  const { data, viewer } = useCrm();
  const { branding } = useBranding();
  const router = useRouter();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef<Map<string, number> | null>(null);
  const snoozed = useRef(new Map<string, number>());
  const leadMs = data.settings.reminderMinutes * 60 * 1000;

  const open = useCallback(
    (item: UpcomingItem, call: boolean) => {
      window.focus();
      router.push(`/leads?lead=${item.lead.id}${call ? "&call=1" : ""}`);
    },
    [router]
  );

  const tick = useCallback(() => {
    const t = Date.now();
    setNow(t);
    fired.current ??= loadFired(viewer.id);
    const items = upcomingFor(data, { ownerId: viewer.id, now: t - DUE_GRACE_MS, days: 1 });
    const fresh: Reminder[] = [];

    for (const item of items) {
      const at = new Date(item.at).getTime();
      const phase: Phase | null = at <= t ? (t - at <= DUE_GRACE_MS ? "due" : null) : at - t <= leadMs ? "soon" : null;
      if (!phase) continue;
      if ((snoozed.current.get(item.id) ?? 0) > t) continue;
      const key = `${item.id}|${item.at}|${phase}`;
      if (fired.current.has(key)) continue;
      fired.current.set(key, t);
      fresh.push({ key, item, phase });
    }
    if (!fresh.length) return;
    saveFired(viewer.id, fired.current);
    setReminders((r) => [...r.filter((x) => !fresh.some((f) => f.item.id === x.item.id)), ...fresh].slice(-4));
    playChime();
    for (const r of fresh) {
      const n = desktopNotify(
        titleFor(r, t),
        `${r.item.lead.decisionMakerName} · ${r.item.lead.businessName} · ${formatTime(r.item.at)}`,
        branding.logoDataUrl ?? undefined
      );
      if (n)
        n.onclick = () => {
          open(r.item, r.item.kind === "followup");
          n.close();
        };
    }
  }, [data, viewer.id, leadMs, branding.logoDataUrl, open]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [tick]);

  const dismiss = (key: string) => setReminders((r) => r.filter((x) => x.key !== key));
  const snooze = (r: Reminder) => {
    snoozed.current.set(r.item.id, Date.now() + SNOOZE_MS);
    // Let both phases fire again once the snooze ends.
    for (const k of [...(fired.current?.keys() ?? [])]) if (k.startsWith(`${r.item.id}|`)) fired.current!.delete(k);
    saveFired(viewer.id, fired.current ?? new Map());
    dismiss(r.key);
  };

  if (!reminders.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[90] flex w-[min(390px,calc(100vw-32px))] flex-col gap-3" aria-live="polite">
      {reminders.map((r) => {
        const isMeeting = r.item.kind === "meeting";
        const Icon = isMeeting ? Video : BellRing;
        return (
          <div key={r.key} role="alert" className="animate-pop-in pointer-events-auto rounded-[20px] bg-white p-5 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.3),0_0_0_1px_rgba(10,10,10,0.06)]">
            <div className="flex items-start gap-3.5">
              <span className={r.phase === "due" ? "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#E5484D] text-white" : "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg"}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14.5px] font-medium">{titleFor(r, now)}</p>
                <p className="mt-1 truncate text-[13px] text-neutral-600">
                  {r.item.lead.decisionMakerName} · {r.item.lead.businessName}
                </p>
                <p className="mt-0.5 text-[12px] tabular-nums text-neutral-500">
                  {formatTime(r.item.at)} · {r.item.lead.phone}
                </p>
              </div>
              <button aria-label="Dismiss reminder" onClick={() => dismiss(r.key)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-page hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <a
                href={dialHref(r.item.lead.phone, data.settings.dialerScheme)}
                onClick={() => {
                  open(r.item, true);
                  dismiss(r.key);
                }}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-brand text-[13px] text-brand-fg transition-colors hover:bg-brand-600"
              >
                <PhoneCall className="h-4 w-4" /> Call now
              </a>
              <button onClick={() => snooze(r)} className="h-10 rounded-full bg-page px-4 text-[13px] text-ink transition-colors hover:bg-neutral-200">
                Snooze 10 min
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function titleFor(r: Reminder, now: number) {
  const what = r.item.kind === "meeting" ? r.item.title : "Follow-up call";
  if (r.phase === "due") return `${what} is due now`;
  const mins = Math.max(1, Math.round((new Date(r.item.at).getTime() - now) / 60000));
  return `${what} in ${mins} min`;
}
