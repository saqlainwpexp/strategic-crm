"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useCrm } from "@/components/providers/CrmProvider";
import { StatusDot } from "@/components/ui/Badges";
import { cn } from "@/lib/utils";
import { pct } from "@/lib/email";
import type { AccountStatus, CampaignStatus, SendStats } from "@/lib/email-types";
import type { ActionResult } from "@/server/actions";

/**
 * Runs an email server action: shows a toast, refreshes the page data on success,
 * and tracks which action is in flight (for button spinners/disabled states).
 */
export function useEmailAction() {
  const { notify } = useCrm();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, action: Promise<ActionResult<T>>, success?: string | ((data: T) => string)): Promise<T | null> => {
      setBusy(key);
      try {
        const res = await action;
        if (!res.ok) {
          notify(res.error, "error");
          if (/sign in again/i.test(res.error)) router.push("/login");
          return null;
        }
        if (success) notify(typeof success === "function" ? success(res.data) : success);
        router.refresh();
        return res.data;
      } catch {
        notify("Couldn't reach the server. Please try again.", "error");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [notify, router]
  );

  return { run, busy };
}

// ─── Status labels ───────────────────────────────────────────

export const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; color: string }> = {
  DRAFT: { label: "Draft", color: "#A3A3A3" },
  SCHEDULED: { label: "Scheduled", color: "#3B82F6" },
  SENDING: { label: "Sending", color: "rgb(var(--brand-500))" },
  PAUSED: { label: "Paused", color: "#D97706" },
  SENT: { label: "Sent", color: "#1F9D4C" },
  CANCELLED: { label: "Cancelled", color: "#E5484D" },
};

export function CampaignStatusLabel({ status }: { status: CampaignStatus }) {
  const s = CAMPAIGN_STATUS[status];
  return <StatusDot color={s.color} label={s.label} />;
}

export const ACCOUNT_STATUS: Record<AccountStatus, { label: string; color: string }> = {
  PENDING: { label: "Not tested", color: "#A3A3A3" },
  CONNECTED: { label: "Connected", color: "#1F9D4C" },
  ERROR: { label: "Needs attention", color: "#E5484D" },
  DISCONNECTED: { label: "Paused", color: "#D97706" },
};

/** Tinted pill (used on cards). */
export function TintPill({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium", className)}
      style={{ background: `color-mix(in srgb, ${color} 10%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

// ─── Metrics ─────────────────────────────────────────────────

/** "42.5%" with the raw count underneath — the rate columns of campaign tables. */
export function RateCell({ part, whole, className }: { part: number; whole: number; className?: string }) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums text-ink", className)}>
      {whole ? `${pct(part, whole)}%` : "—"}
      <span className="mt-0.5 block text-[11.5px] text-neutral-500">{part.toLocaleString("en-US")}</span>
    </span>
  );
}

export function rates(s: SendStats) {
  return {
    open: pct(s.opened, s.sent),
    click: pct(s.clicked, s.sent),
    reply: pct(s.replied, s.sent),
    bounce: pct(s.bounced, s.sent),
  };
}

/** Thin progress bar (sending progress, daily quota). */
export function Meter({ value, max, className, tone = "brand" }: { value: number; max: number; className?: string; tone?: "brand" | "ink" }) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-page", className)}>
      <div className={cn("h-full rounded-full transition-[width]", tone === "brand" ? "bg-brand" : "bg-ink")} style={{ width: `${w}%` }} />
    </div>
  );
}

/** Small uppercase section label used inside cards. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[11.5px] uppercase tracking-[0.06em] text-neutral-400", className)}>{children}</p>;
}
