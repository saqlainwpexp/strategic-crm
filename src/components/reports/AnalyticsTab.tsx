"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck2, PhoneCall, PhoneOutgoing, Users } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/Layout";
import { REP_COLORS, rangeHint, useReport, useReportReps, type ReportRange } from "./useReport";
import { formatDuration, pct } from "@/lib/utils";

const tooltipStyle = {
  borderRadius: 14,
  border: "none",
  boxShadow: "0 12px 32px rgba(10,10,10,0.14)",
  fontSize: 12,
  padding: "10px 14px",
};

export function AnalyticsTab({ range, repId }: { range: ReportRange; repId: string }) {
  const { data } = useCrm();
  const r = useReport(range, repId);
  const reps = useReportReps();
  const repColor = (id: string) => REP_COLORS[Math.max(0, reps.findIndex((x) => x.id === id)) % REP_COLORS.length];
  const t = r.totals;
  const maxFunnel = Math.max(1, r.funnel[0].value);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={PhoneOutgoing} label="Calls made" value={t.calls.toLocaleString("en-US")} delta={t.callsDelta} hint={rangeHint(range)} />
        <StatCard icon={PhoneCall} label="Connect rate" value={`${t.connectRate}%`} delta={t.connectDelta} hint={`${t.connects} conversations`} />
        <StatCard icon={CalendarCheck2} label="Meetings booked" value={t.meetings} delta={t.meetingsDelta} hint={`${pct(t.meetings, t.connects)}% of conversations`} />
        <StatCard icon={Users} label="Leads reached" value={t.leadsReached} hint="Unique leads dialled" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-7">
          <CardHeader
            title={range === "today" ? "Calls by hour" : "Calls per day"}
            subtitle={r.shownReps.length > 1 ? "Stacked by rep" : undefined}
            actions={
              r.shownReps.length > 1 && (
                <div className="flex flex-wrap gap-4">
                  {r.shownReps.map((u) => (
                    <span key={u.id} className="flex items-center gap-2 text-[12.5px] text-neutral-700">
                      <span className="h-2 w-2 rounded-full" style={{ background: repColor(u.id) }} />
                      {u.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              )
            }
          />
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap={range === "30d" || range === "mtd" ? "18%" : "32%"}>
                <CartesianGrid vertical={false} stroke="#EFEFEF" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8A8A8A", fontSize: 12 }} dy={8} interval={r.series.length > 14 ? 2 : 0} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: "#A3A3A3", fontSize: 12 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgb(var(--brand-500) / 0.07)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v: number, k: string) => [v, data.users.find((u) => u.id === k)?.name ?? k]}
                />
                {r.shownReps.map((u, i) => (
                  <Bar key={u.id} isAnimationActive={false} dataKey={u.id} stackId="calls" fill={repColor(u.id)} radius={i === r.shownReps.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-7">
          <CardHeader title="Call outcomes" subtitle={`${t.calls} calls in this period`} />
          {r.outcomes.length === 0 ? (
            <p className="py-16 text-center text-[13.5px] text-neutral-500">No calls in this period yet.</p>
          ) : (
            <>
              <div className="relative h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie isAnimationActive={false} data={r.outcomes} dataKey="value" nameKey="label" innerRadius={66} outerRadius={94} paddingAngle={2} stroke="none">
                      {r.outcomes.map((o) => (
                        <Cell key={o.label} fill={o.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[26px] font-normal tabular-nums leading-none">{t.connectRate}%</span>
                  <span className="mt-1.5 text-[11.5px] text-neutral-500">connected</span>
                </div>
              </div>
              <ul className="mt-6 space-y-3">
                {r.outcomes.map((o) => (
                  <li key={o.label} className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2.5 text-neutral-700">
                      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: o.color }} />
                      {o.label}
                    </span>
                    <span className="tabular-nums">
                      {o.value} <span className="text-neutral-400">· {pct(o.value, t.calls)}%</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <CardHeader title="Pipeline funnel" subtitle="Where every lead has reached so far" />
          <div className="flex flex-col gap-5">
            {r.funnel.map((f, i) => {
              const prev = i > 0 ? r.funnel[i - 1].value : f.value;
              const last = i === r.funnel.length - 1;
              return (
                <div key={f.label}>
                  <div className="mb-2 flex items-center justify-between text-[13.5px]">
                    <span>{f.label}</span>
                    <span className="tabular-nums">
                      {f.value.toLocaleString("en-US")}
                      {i > 0 && <span className="ml-2 text-[12px] text-neutral-400">{pct(f.value, prev)}% of previous</span>}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-page">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(1.5, (f.value / maxFunnel) * 100)}%`,
                        background: i === 0 ? "rgb(var(--ink))" : last ? "rgb(var(--brand-700))" : "rgb(var(--brand-500))",
                        opacity: i === 0 || last ? 1 : 1 - i * 0.1,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-7">
          <CardHeader title="Script performance" subtitle="Which scripts turn conversations into meetings" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-[12.5px] text-neutral-600">
                  {["Script", "Calls", "Avg talk", "Meetings", "Meeting rate"].map((h) => (
                    <th key={h} className="border-b border-neutral-100 pb-3 pr-3 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.scripts.map((s) => (
                  <tr key={s.script.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-3.5 pr-3">
                      <p className="max-w-[220px] truncate">{s.script.title}</p>
                      <p className="text-[11.5px] text-neutral-500">{s.script.active ? s.script.category : "Retired"}</p>
                    </td>
                    <td className="py-3.5 pr-3 tabular-nums">{s.calls}</td>
                    <td className="py-3.5 pr-3 tabular-nums">{s.calls ? formatDuration(s.avgTalk) : "—"}</td>
                    <td className="py-3.5 pr-3 tabular-nums">{s.meetings}</td>
                    <td className="py-3.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-12 tabular-nums">{s.calls ? `${s.rate}%` : "—"}</span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-page">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, s.rate * 3)}%` }} />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

    </div>
  );
}
