"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2 } from "lucide-react";
import type { LogAccount } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useCrm } from "@/components/providers/CrmProvider";
import { CONTACT_STAGE_LABEL, EVENT_LABEL, JOB_STAGE_LABEL, STAGE_TONE, channelLabel } from "@/lib/outreach-log/constants";
import { formatDateTime } from "@/lib/date";
import { loadLogTimeline } from "@/server/outreach-log/actions";

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Runs a log server action: toasts errors / limit warnings, refreshes the page data on success. */
export function useLogAction() {
  const { notify } = useCrm();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(work: () => Promise<ActionResult<T>>, success?: string) =>
      new Promise<T | null>((resolve) =>
        start(async () => {
          try {
            const res = await work();
            if (!res.ok) {
              notify(res.error, "error");
              return resolve(null);
            }
            const warning = (res.data as { warning?: string | null } | null)?.warning;
            if (warning) notify(warning, "error");
            else if (success) notify(success);
            router.refresh();
            resolve(res.data);
          } catch {
            notify("Couldn't reach the server — your last change may not be saved.", "error");
            resolve(null);
          }
        })
      ),
    [notify, router]
  );
  return { run, pending };
}

export function StagePill({ stage, kind, className }: { stage: string; kind: "contact" | "job"; className?: string }) {
  const label = (kind === "contact" ? (CONTACT_STAGE_LABEL as Record<string, string>) : (JOB_STAGE_LABEL as Record<string, string>))[stage] ?? stage;
  return <span className={cn("inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium", STAGE_TONE[stage] ?? "bg-neutral-100 text-neutral-600", className)}>{label}</span>;
}

const CHANNEL_DOT: Record<string, string> = {
  whatsapp: "bg-[#25D366]",
  email: "bg-sky-500",
  linkedin: "bg-[#0A66C2]",
  facebook: "bg-[#1877F2]",
  instagram: "bg-[#E1306C]",
  x: "bg-neutral-900",
  threads: "bg-neutral-700",
  tiktok: "bg-[#FE2C55]",
  telegram: "bg-[#2AABEE]",
  upwork: "bg-[#14A800]",
  phone: "bg-violet-500",
};

export function ChannelTag({ channel, account }: { channel: string; account?: string | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] text-neutral-600">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", CHANNEL_DOT[channel] ?? "bg-neutral-400")} />
      <span className="truncate">
        {channelLabel(channel)}
        {account && <span className="text-neutral-400"> · {account}</span>}
      </span>
    </span>
  );
}

/** "Overdue 2d" / "Today 3:00 PM" / "in 4d". */
export function DueText({ at, className }: { at: string | Date | null; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  if (!at) return <span className={cn("text-[13px] text-neutral-400", className)}>—</span>;
  const t = new Date(at).getTime();
  if (now === null) return <span className={cn("text-[13px] text-neutral-500", className)}>{formatDateTime(new Date(at).toISOString())}</span>;
  const diff = t - now;
  const days = Math.round(Math.abs(diff) / 864e5);
  const sameDay = new Date(t).toDateString() === new Date(now).toDateString();
  const label = diff < 0 ? (days >= 1 ? `Overdue ${days}d` : "Due now") : sameDay ? "Due today" : days <= 1 ? "Tomorrow" : `In ${days}d`;
  return (
    <span
      title={formatDateTime(new Date(at).toISOString())}
      className={cn("text-[13px] font-medium tabular-nums", diff < 0 ? "text-rose-600" : sameDay ? "text-amber-600" : "text-neutral-500", className)}
    >
      {label}
    </span>
  );
}

export function AccountSelect({
  accounts,
  channel,
  value,
  onChange,
  className,
}: {
  accounts: LogAccount[];
  channel?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const list = accounts.filter((a) => a.active && (!channel || a.channel === channel));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-11 w-full cursor-pointer rounded-xl border border-black/[0.08] bg-white px-4 text-[14px] outline-none focus:border-ink/30", className)}
    >
      <option value="">{list.length ? "No specific account" : channel ? `No ${channelLabel(channel)} accounts yet` : "No accounts yet"}</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
          {a.handle ? ` (${a.handle})` : ""}
        </option>
      ))}
    </select>
  );
}

type TimelineRow = {
  id: string;
  type: string;
  direction: string;
  text: string | null;
  fromStage: string | null;
  toStage: string | null;
  byAgent: boolean;
  occurredAt: string;
  account: { label: string; channel: string } | null;
  user: { name: string } | null;
};

export function Timeline({ kind, id, version }: { kind: "contact" | "job"; id: string; version: number }) {
  const [rows, setRows] = useState<TimelineRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadLogTimeline(kind, id).then((r) => live && setRows(r.ok ? (r.data as unknown as TimelineRow[]) : []));
    return () => {
      live = false;
    };
  }, [kind, id, version]);
  if (!rows) return <Loader2 className="mx-auto my-10 h-5 w-5 animate-spin text-neutral-400" />;
  if (!rows.length) return <p className="py-8 text-center text-[13.5px] text-neutral-400">Nothing logged yet.</p>;
  const labels = kind === "contact" ? (CONTACT_STAGE_LABEL as Record<string, string>) : (JOB_STAGE_LABEL as Record<string, string>);
  return (
    <ol className="space-y-5">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-4">
          <span
            className={cn(
              "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
              r.direction === "outbound" ? "bg-ink" : r.direction === "inbound" ? "bg-brand" : "bg-neutral-300"
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium">
              {r.type === "stage" ? `Stage → ${labels[r.toStage ?? ""] ?? r.toStage}` : EVENT_LABEL[r.type] ?? r.type}
              {r.type !== "stage" && r.toStage && <span className="font-normal text-neutral-500"> · now {labels[r.toStage] ?? r.toStage}</span>}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12.5px] text-neutral-500">
              {formatDateTime(r.occurredAt)}
              {r.account && <span>· {r.account.label}</span>}
              {r.byAgent ? (
                <span className="inline-flex items-center gap-1">
                  · <Bot className="h-3.5 w-3.5" /> agent
                </span>
              ) : (
                r.user && <span>· {r.user.name}</span>
              )}
            </p>
            {r.text && <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-page px-4 py-3 text-[13.5px] leading-relaxed text-neutral-700">{r.text}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
