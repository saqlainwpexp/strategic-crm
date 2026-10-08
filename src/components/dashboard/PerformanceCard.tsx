"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, CalendarDays, ChartColumn, Check, ChevronDown, CircleCheck, Users } from "lucide-react";
import { FlowBarChart } from "@/components/charts/FlowBarChart";
import { Delta } from "@/components/ui/Badges";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { useCrm } from "@/components/providers/CrmProvider";
import { AGENCY_SERVICES, DEAL_STAGES, OPEN_STAGES, SERVICE_COLORS } from "@/lib/constants";
import { lastMonthKeys, monthKey, monthLabel, todayKey } from "@/lib/date";
import { cn, compactMoney, deltaLabel, sum } from "@/lib/utils";

const SERIES = AGENCY_SERVICES.map((s) => ({ key: s, label: s, color: SERVICE_COLORS[s] }));

type RangeKind = "3m" | "6m" | "12m" | "ytd" | "custom";
type Range = { kind: RangeKind; from: string; to: string }; // inclusive month keys "YYYY-MM"

const PRESETS: { kind: Exclude<RangeKind, "custom">; label: string }[] = [
  { kind: "3m", label: "Last 3 months" },
  { kind: "6m", label: "Last 6 months" },
  { kind: "12m", label: "Last 12 months" },
  { kind: "ytd", label: "This year" },
];
const STORAGE_KEY = "scrm_perf_range";

function addMonths(mk: string, n: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  for (let m = from; m <= to && out.length < 36; m = addMonths(m, 1)) out.push(m);
  return out;
}

function presetRange(kind: Exclude<RangeKind, "custom">): Range {
  const current = todayKey().slice(0, 7);
  if (kind === "ytd") return { kind, from: `${current.slice(0, 4)}-01`, to: current };
  const n = kind === "3m" ? 3 : kind === "6m" ? 6 : 12;
  return { kind, from: lastMonthKeys(n)[0], to: current };
}

function rangeLabel({ from, to }: Range) {
  const [fy, ty] = [from.slice(0, 4), to.slice(0, 4)];
  if (from === to) return `${monthLabel(from, "long")} ${fy}`;
  return fy === ty ? `${monthLabel(from)} – ${monthLabel(to)}, ${ty}` : `${monthLabel(from)} ${fy} – ${monthLabel(to)} ${ty}`;
}

export function PerformanceCard() {
  const { data, viewer } = useCrm();
  const [range, setRange] = useState<Range>(() => presetRange("3m"));

  // Remember the chosen range in this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Range | null;
      if (saved?.kind === "custom" && saved.from <= saved.to) setRange(saved);
      else if (saved && saved.kind !== "custom") setRange(presetRange(saved.kind));
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);
  const choose = (r: Range) => {
    setRange(r);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  };

  const stats = useMemo(() => {
    // Signed revenue: deal value of clients by the month they signed.
    const months = monthsBetween(range.from, range.to);
    const signed = data.leads.filter((l) => l.stage === "CLOSED_WON" && l.closedAt);
    const valueIn = (mks: string[]) => {
      const set = new Set(mks);
      return sum(signed.filter((l) => set.has(monthKey(l.closedAt!))).map((l) => l.estimatedValue));
    };
    const byMonth = months.map((mk) => ({
      label: monthLabel(mk),
      values: Object.fromEntries(
        AGENCY_SERVICES.map((s) => [s, sum(signed.filter((l) => l.service === s && monthKey(l.closedAt!) === mk).map((l) => l.estimatedValue))])
      ),
    }));
    const total = valueIn(months);
    const prevMonths = months.map((m) => addMonths(m, -months.length));
    const prevTotal = valueIn(prevMonths);
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const current = todayKey().slice(0, 7);
    const deals = data.leads.filter((l) => DEAL_STAGES.includes(l.stage));

    return {
      byMonth,
      total,
      // Only compare when there's history for the previous period.
      totalDelta: prevTotal > 0 ? deltaLabel(total, prevTotal) : null,
      kpis: [
        {
          icon: Users,
          label: "Active Leads",
          value: data.leads.filter((l) => OPEN_STAGES.includes(l.stage)).length.toLocaleString("en-US"),
          delta: `+${data.leads.filter((l) => l.createdAt >= weekAgo).length} this wk`,
        },
        {
          icon: Briefcase,
          label: "Active Deals",
          value: deals.length.toLocaleString("en-US"),
          delta: `+${deals.filter((l) => (l.lastContactedAt ?? "") >= weekAgo).length} this wk`,
        },
        {
          icon: CircleCheck,
          label: "Signed Clients",
          value: signed.length.toLocaleString("en-US"),
          delta: `+${signed.filter((l) => monthKey(l.closedAt!) === current).length} this mo`,
        },
      ],
    };
  }, [data.leads, range]);

  const title = viewer.role === "SALES" ? "My performance" : viewer.role === "BD" ? "Team performance" : "Performance";

  return (
    <section className="card h-full p-7">
      <div className="grid h-full grid-cols-1 gap-10 lg:grid-cols-[1.12fr_1fr] lg:gap-12">
        <div className="flex flex-col">
          <h2 className="text-[18px] font-medium tracking-[-0.01em]">{title}</h2>
          <div className="mt-5 flex-1">
            <FlowBarChart data={stats.byMonth} series={SERIES} height={280} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-2 text-[12.5px] text-neutral-700">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex justify-end">
            <RangePicker range={range} onChange={choose} />
          </div>

          <div className="mt-4 pb-6">
            <p className="flex items-center gap-2 text-[13.5px] text-neutral-700">
              <ChartColumn className="h-4 w-4" strokeWidth={1.7} />
              Total Revenue
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-[34px] font-normal leading-tight tracking-[-0.02em]">{compactMoney(stats.total)}</span>
              {stats.totalDelta && <Delta value={stats.totalDelta} />}
            </div>
          </div>

          <div className="flex flex-1 flex-col">
            {stats.kpis.map((k) => (
              <div key={k.label} className="flex min-h-[72px] flex-1 items-center justify-between gap-4 border-t border-neutral-200/80">
                <span className="flex items-center gap-3 text-[15.5px] text-neutral-800">
                  <k.icon className="h-[18px] w-[18px] text-neutral-700" strokeWidth={1.6} />
                  {k.label}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[15px] font-medium tabular-nums">{k.value}</span>
                  <Delta value={k.delta} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RangePicker({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = todayKey().slice(0, 7);
  const monthOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => addMonths(current, -i)), [current]);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  useEffect(() => {
    if (!open) return;
    setFrom(range.from);
    setTo(range.to);
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, range]);

  const optionLabel = (mk: string) => `${monthLabel(mk, "long")} ${mk.slice(0, 4)}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-2 rounded-full px-4 text-[12px] transition-colors",
          open ? "bg-ink text-white" : "bg-page text-neutral-700 hover:bg-neutral-200/80"
        )}
      >
        <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.8} />
        {rangeLabel(range)}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="animate-pop-in absolute right-0 top-[calc(100%+10px)] z-30 w-[300px] rounded-[20px] bg-white p-2.5 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.25),0_0_0_1px_rgba(10,10,10,0.05)]">
          {PRESETS.map((p) => {
            const active = range.kind === p.kind;
            return (
              <button
                key={p.kind}
                onClick={() => {
                  onChange(presetRange(p.kind));
                  setOpen(false);
                }}
                className={cn("flex h-11 w-full items-center justify-between rounded-xl px-3.5 text-[13.5px]", active ? "bg-ink text-white" : "hover:bg-page")}
              >
                {p.label}
                {active && <Check className="h-4 w-4" strokeWidth={2.2} />}
              </button>
            );
          })}

          <div className="mt-2 border-t border-neutral-100 px-1.5 pb-1.5 pt-4">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.06em] text-neutral-400">Custom range</p>
            <div className="grid gap-2.5">
              <label className="grid gap-1.5 text-[12px] text-neutral-500">
                From
                <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {optionLabel(m)}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="grid gap-1.5 text-[12px] text-neutral-500">
                To
                <Select value={to} onChange={(e) => setTo(e.target.value)}>
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {optionLabel(m)}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {from > to && <p className="mt-2 text-[12px] text-rose-600">“From” must be before “To”.</p>}
            <Button
              size="sm"
              className="mt-3.5 w-full"
              disabled={from > to}
              onClick={() => {
                onChange({ kind: "custom", from, to });
                setOpen(false);
              }}
            >
              Apply range
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
