"use client";

import { useMemo, useState } from "react";
import { Banknote, CalendarCheck2, CircleCheck, Clock, Headphones, PhoneCall, PhoneOutgoing, Receipt, ReceiptText } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState, StatCard } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { SearchInput } from "@/components/ui/Form";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { StatusDot } from "@/components/ui/Badges";
import { Avatar, UserChip } from "@/components/ui/Avatar";
import { FlowBarChart } from "@/components/charts/FlowBarChart";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadForm } from "@/components/leads/LeadForm";
import { rangeHint, useReport, type ReportRange } from "./useReport";
import { AGENCY_SERVICES, PAYMENT_STATUS_DOT, PAYMENT_STATUS_LABELS, SERVICE_COLORS } from "@/lib/constants";
import type { Lead, User } from "@/lib/types";
import { dayKey, dayLabel, formatDate, formatTime, pktISO, shiftDayKey, todayKey, weekdayOf } from "@/lib/date";
import { cn, compactMoney, formatHours, formatMoney, sum } from "@/lib/utils";

const SERIES = AGENCY_SERVICES.map((s) => ({ key: s, label: s, color: SERVICE_COLORS[s] }));

export function SalesActivityTab({ range, repId }: { range: ReportRange; repId: string }) {
  const { perms } = useCrm();
  const r = useReport(range, repId);
  const t = r.totals;
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const multi = r.shownReps.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Activity */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={PhoneOutgoing} label="Calls made" value={t.calls.toLocaleString("en-US")} delta={t.callsDelta} hint={rangeHint(range)} />
        <StatCard icon={PhoneCall} label="Connected" value={t.connects} hint={`${t.connectRate}% connect rate`} />
        <StatCard icon={Headphones} label="Talk time" value={formatHours(t.talk)} delta={t.talkDelta} hint="Time on the phone" />
        <StatCard icon={Clock} label="Hours worked" value={formatHours(t.hours)} delta={t.hoursDelta} hint={`${t.perHour} calls per hour on shift`} />
      </div>
      {/* Sales */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Banknote} label="Cash collected" value={compactMoney(t.collected)} delta={t.collectedDelta} hint={`${compactMoney(t.collectedAllTime)} all time`} />
        <StatCard icon={ReceiptText} label="Outstanding" value={compactMoney(t.outstanding)} hint={`${t.dueCount} invoice${t.dueCount === 1 ? "" : "s"} · ${t.lateCount} past due`} />
        <StatCard icon={CircleCheck} label="Signed clients" value={t.signed} hint={t.signed ? `${compactMoney(t.signedValue)} in new deals` : `${t.clients} clients in total`} />
        <StatCard icon={CalendarCheck2} label="Meetings booked" value={t.meetings} delta={t.meetingsDelta} hint="From calls in this period" />
      </div>

      {multi && <TeamTable board={r.board} />}

      <DailyTable rows={r.daily} />

      <WorkingHours reps={r.shownReps} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-7">
          <CardHeader title="Cash collected" subtitle="Payments received per month, by service" className="mb-4" />
          <FlowBarChart data={r.cashChart} series={SERIES} height={300} />
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {SERIES.map((x) => (
              <span key={x.key} className="flex items-center gap-2 text-[12.5px] text-neutral-700">
                <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
                {x.label}
              </span>
            ))}
          </div>
        </Card>
        <Card className="p-7">
          {perms.seesTeam && multi ? (
            <>
              <CardHeader title="Collected by rep" subtitle="All-time, with this period in brackets" />
              <Bars items={r.byRepMoney.map((x) => ({ key: x.user.id, label: x.user.name, sub: `${x.clients} client${x.clients === 1 ? "" : "s"} · ${compactMoney(x.inRange)} this period`, value: x.total, user: x.user }))} />
            </>
          ) : (
            <>
              <CardHeader title="Collected by service" subtitle="All-time" />
              <Bars items={r.byService.map((x) => ({ key: x.service, label: x.service, sub: `${x.clients} client${x.clients === 1 ? "" : "s"}`, value: x.total, color: SERVICE_COLORS[x.service] }))} />
            </>
          )}
        </Card>
      </div>

      <Invoices repId={repId} onOpen={setOpenId} />

      <LeadDrawer leadId={openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <LeadForm open={!!editing} onClose={() => setEditing(null)} lead={editing} />
    </div>
  );
}

function Bars({ items }: { items: { key: string; label: string; sub: string; value: number; color?: string; user?: User }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-6">
      {items.map((i) => (
        <div key={i.key}>
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              {i.user && <Avatar name={i.user.name} size={34} />}
              <span className="min-w-0">
                <span className="block truncate text-[14px]">{i.label}</span>
                <span className="block truncate text-[12px] text-neutral-500">{i.sub}</span>
              </span>
            </span>
            <span className="text-[14px] tabular-nums">{compactMoney(i.value)}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-page">
            <div className="h-full rounded-full" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? "rgb(var(--brand-500))" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamTable({ board }: { board: ReturnType<typeof useReport>["board"] }) {
  return (
    <Card className="p-0">
      <div className="px-7 pb-5 pt-6">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Team performance</h2>
        <p className="mt-1.5 text-[13px] text-neutral-500">Activity and results for the selected period</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12.5px] text-neutral-700">
              {["Rep", "Status", "Hours", "Calls", "Calls/hr", "Talk time", "Connect %", "Meetings", "Signed", "Collected"].map((h, i) => (
                <th key={h} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.map((r, i) => (
              <tr key={r.user.id} className="border-b border-neutral-100 last:border-0">
                <td className="py-4 pl-7 pr-4">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-[12px] tabular-nums text-neutral-400">{i + 1}</span>
                    <Avatar name={r.user.name} size={34} />
                    <div>
                      <p className="font-medium">{r.user.name}</p>
                      <p className="text-[11.5px] text-neutral-500">{r.user.title}</p>
                    </div>
                  </div>
                </td>
                <td className="py-4 pr-4">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", r.onShift ? "bg-[#22C55E]" : "bg-neutral-300")} />
                    {r.onShift ? "On shift" : "Off"}
                  </span>
                </td>
                <td className="py-4 pr-4 tabular-nums">{formatHours(r.hours)}</td>
                <td className="py-4 pr-4 tabular-nums">{r.calls}</td>
                <td className="py-4 pr-4 tabular-nums">{r.perHour}</td>
                <td className="py-4 pr-4 tabular-nums">{formatHours(r.talk)}</td>
                <td className="py-4 pr-4 tabular-nums">{r.connectRate}%</td>
                <td className="py-4 pr-4 tabular-nums">{r.meetings}</td>
                <td className="py-4 pr-4 tabular-nums">{r.signed}</td>
                <td className="py-4 pr-4 tabular-nums">{compactMoney(r.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function DailyTable({ rows }: { rows: ReturnType<typeof useReport>["daily"] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 7);
  const total = {
    hours: sum(rows.map((r) => r.hours)),
    calls: sum(rows.map((r) => r.calls)),
    connects: sum(rows.map((r) => r.connects)),
    talk: sum(rows.map((r) => r.talk)),
    meetings: sum(rows.map((r) => r.meetings)),
    collected: sum(rows.map((r) => r.collected)),
  };
  const cols = ["Day", "Hours worked", "Calls", "Connected", "Talk time", "Meetings", "Collected"];
  return (
    <Card className="p-0">
      <div className="px-7 pb-5 pt-6">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Day by day</h2>
        <p className="mt-1.5 text-[13px] text-neutral-500">Working hours, calls and money for each day in the period</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12.5px] text-neutral-700">
              {cols.map((h, i) => (
                <th key={h} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.day} className={cn("border-b border-neutral-100", !r.calls && !r.hours && "text-neutral-400")}>
                <td className="py-3.5 pl-7 pr-4">{dayLabel(r.day)}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.hours ? formatHours(r.hours) : "—"}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.calls}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.connects}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.talk ? formatHours(r.talk) : "—"}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.meetings}</td>
                <td className="py-3.5 pr-4 tabular-nums">{r.collected ? compactMoney(r.collected) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-soft font-medium">
              <td className="py-3.5 pl-7 pr-4">Total</td>
              <td className="py-3.5 pr-4 tabular-nums">{formatHours(total.hours)}</td>
              <td className="py-3.5 pr-4 tabular-nums">{total.calls}</td>
              <td className="py-3.5 pr-4 tabular-nums">{total.connects}</td>
              <td className="py-3.5 pr-4 tabular-nums">{formatHours(total.talk)}</td>
              <td className="py-3.5 pr-4 tabular-nums">{total.meetings}</td>
              <td className="py-3.5 pr-4 tabular-nums">{compactMoney(total.collected)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {rows.length > 7 && (
        <div className="border-t border-neutral-100 px-7 py-4 text-center">
          <Button variant="link" size="sm" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show last 7 days" : `Show all ${rows.length} days`}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Timesheet grid: hours per rep for the last 7 workdays. */
function WorkingHours({ reps }: { reps: User[] }) {
  const { data } = useCrm();
  const today = todayKey();
  const now = new Date().toISOString();
  const days = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; out.length < 7; i++) {
      const k = shiftDayKey(today, -i);
      if (weekdayOf(k) !== 6) out.unshift(k);
    }
    return out;
  }, [today]);

  return (
    <Card className="p-0">
      <div className="px-7 pb-5 pt-6">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Working hours</h2>
        <p className="mt-1.5 text-[13px] text-neutral-500">Clock-in to clock-out for the last 7 working days (PKT). Darker = longer shift.</p>
      </div>
      <div className="overflow-x-auto px-7 pb-7">
        <div className="grid min-w-[980px] gap-2" style={{ gridTemplateColumns: `200px repeat(${days.length}, 1fr) 110px` }}>
          <span />
          {days.map((d) => (
            <span key={d} className={cn("px-2 pb-1 text-[12.5px]", d === today ? "text-ink" : "text-neutral-500")}>
              {new Date(pktISO(d, 12)).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "Asia/Karachi" })}
            </span>
          ))}
          <span className="px-2 pb-1 text-right text-[12.5px] text-neutral-500">Total</span>

          {reps.map((u) => {
            let total = 0;
            return (
              <div key={u.id} className="contents">
                <span className="flex items-center gap-3 py-1">
                  <Avatar name={u.name} size={30} />
                  <span className="truncate text-[13.5px]">{u.name}</span>
                </span>
                {days.map((d) => {
                  const log = data.timeLogs.find((tl) => tl.userId === u.id && dayKey(tl.clockIn) === d);
                  if (!log)
                    return (
                      <span key={d} className="grid h-[60px] place-items-center rounded-xl bg-soft text-[12px] text-neutral-400">
                        —
                      </span>
                    );
                  const secs = Math.max(0, (new Date(log.clockOut ?? now).getTime() - new Date(log.clockIn).getTime()) / 1000);
                  total += secs;
                  const intensity = Math.min(1, secs / (9 * 3600));
                  const dark = intensity > 0.6;
                  return (
                    <span
                      key={d}
                      className="flex h-[60px] flex-col justify-center rounded-xl px-3"
                      style={{ background: `rgb(var(--brand-500) / ${0.12 + intensity * 0.75})`, color: dark ? "#fff" : "rgb(var(--ink))" }}
                    >
                      <span className="text-[13px] tabular-nums">{formatHours(secs)}</span>
                      <span className={cn("text-[11px] tabular-nums", dark ? "text-white/80" : "text-neutral-600")}>
                        {formatTime(log.clockIn)} – {log.clockOut ? formatTime(log.clockOut) : "now"}
                      </span>
                    </span>
                  );
                })}
                <span className="flex items-center justify-end px-2 text-[14px] tabular-nums">{formatHours(total)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

type PayFilter = "all" | "paid" | "due";

function Invoices({ repId, onOpen }: { repId: string; onOpen: (leadId: string) => void }) {
  const { data, perms, userById, leadById, updatePayment } = useCrm();
  const [filter, setFilter] = useState<PayFilter>("all");
  const [q, setQ] = useState("");
  const now = new Date().toISOString();

  const base = useMemo(() => data.payments.filter((p) => !repId || p.userId === repId), [data.payments, repId]);
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return base
      .filter((p) => (filter === "paid" ? p.status === "PAID" : filter === "due" ? p.status !== "PAID" && p.status !== "REFUNDED" : true))
      .filter((p) => !term || p.invoiceNo.toLowerCase().includes(term) || (leadById(p.leadId)?.businessName.toLowerCase().includes(term) ?? false))
      .sort((a, b) => (b.paidAt ?? b.dueDate).localeCompare(a.paidAt ?? a.dueDate));
  }, [base, filter, q, leadById]);
  const dueCount = base.filter((p) => p.status !== "PAID" && p.status !== "REFUNDED").length;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Invoices & payments</h2>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client or invoice #" className="w-[220px]" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: base.length },
              { value: "paid", label: "Received" },
              { value: "due", label: "Due", count: dueCount },
            ]}
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments yet" body="Record a payment when a client pays an advance or an invoice." className="pb-14" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="text-left text-[12.5px] text-neutral-700">
                {["Invoice", "Client", "Service", "Amount", "Status", "Date", perms.seesTeam ? "Rep" : null, ""].map(
                  (h, i) =>
                    h !== null && (
                      <th key={i} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                        {h}
                      </th>
                    )
                )}
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {rows.map((p) => {
                const lead = leadById(p.leadId);
                const late = p.status !== "PAID" && p.dueDate < now;
                const rep = userById(p.userId);
                return (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-4 pl-7 pr-4 font-mono text-[12.5px] text-neutral-600">{p.invoiceNo}</td>
                    <td className="py-4 pr-4">
                      {lead ? (
                        <button onClick={() => onOpen(lead.id)} className="flex items-center gap-3 text-left">
                          <LeadThumb lead={lead} size={34} />
                          <span className="max-w-[220px] truncate font-medium hover:underline">{lead.businessName}</span>
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-4 pr-4">{p.service}</td>
                    <td className="py-4 pr-4 tabular-nums">{formatMoney(p.amount)}</td>
                    <td className="py-4 pr-4">
                      <StatusDot color={late ? "#E5484D" : PAYMENT_STATUS_DOT[p.status]} label={late ? "Past due" : PAYMENT_STATUS_LABELS[p.status]} />
                    </td>
                    <td className="whitespace-nowrap py-4 pr-4">
                      {p.paidAt ? (
                        <>
                          {formatDate(p.paidAt)} <span className="text-[11.5px] text-neutral-500">received</span>
                        </>
                      ) : (
                        <span className={cn(late && "text-[#E5484D]")}>
                          {formatDate(p.dueDate)} <span className="text-[11.5px] opacity-70">due</span>
                        </span>
                      )}
                    </td>
                    {perms.seesTeam && <td className="py-4 pr-4">{rep ? <UserChip name={rep.name} /> : "—"}</td>}
                    <td className="py-4 pr-7 text-right">
                      {p.status !== "PAID" && (
                        <Button size="sm" variant="secondary" onClick={() => updatePayment(p.id, { status: "PAID", paidAt: new Date().toISOString() })}>
                          Mark paid
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
