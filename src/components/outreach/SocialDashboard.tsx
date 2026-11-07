"use client";

// Dashboard → Social Outreach. Filterable by date range and rep (shared dashboard controls)
// plus platform, campaign and template.

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarCheck2, Handshake, MessageSquareReply, Send, SmilePlus, Trophy, UserPlus } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { FilterSelect } from "@/components/ui/Form";
import { StatCard } from "@/components/ui/Layout";
import { rangeDays, type ReportRange } from "@/components/reports/useReport";
import { PLATFORMS, STAGE_COLOR } from "@/lib/outreach/platforms";
import { MESSAGE_TYPES } from "@/lib/outreach/rules";
import type { OThread } from "@/lib/outreach/types";
import { shiftDayKey, todayKey, zonedISO } from "@/lib/date";
import { pct } from "@/lib/utils";

const tooltipStyle = { borderRadius: 14, border: "none", boxShadow: "0 12px 32px -8px rgba(0,0,0,0.18)", fontSize: 12.5 };

/** Has the thread ever reached this point? (timestamps first, current stage as fallback) */
const reached = {
  contacted: (t: OThread) => !!(t.connectionSentAt || t.firstMessageAt || t.lastOutboundAt),
  connected: (t: OThread) => !!t.connectionAcceptedAt || !!t.firstMessageAt,
  messaged: (t: OThread) => !!t.firstMessageAt,
  replied: (t: OThread) => !!t.lastInboundAt || ["replied", "interested", "call_booked", "won"].includes(t.stage),
  interested: (t: OThread) => ["interested", "call_booked", "won"].includes(t.stage),
  booked: (t: OThread) => ["call_booked", "won"].includes(t.stage),
  won: (t: OThread) => t.stage === "won",
};
const positive = (t: OThread) => t.replySentiment === "positive" || reached.interested(t);

export function SocialDashboard({ range, repId }: { range: ReportRange; repId: string }) {
  const { data } = useOutreach();
  const { userById } = useCrm();
  const [platform, setPlatform] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [templateId, setTemplateId] = useState("");

  const r = useMemo(() => {
    const from = zonedISO(shiftDayKey(todayKey(), -(rangeDays(range) - 1)), 0);
    const inRange = (iso: string | null) => !!iso && iso >= from;
    const threads = data.threads.filter(
      (t) => (!repId || t.ownerId === repId) && (!platform || t.platform === platform) && (!campaignId || t.campaignId === campaignId) && (!templateId || t.templateId === templateId)
    );
    const ids = new Set(threads.map((t) => t.id));
    const acts = data.activities.filter((a) => ids.has(a.threadId) && inRange(a.occurredAt));
    const out = acts.filter((a) => a.direction === "outbound");

    const connSent = threads.filter((t) => inRange(t.connectionSentAt));
    const messaged = threads.filter((t) => inRange(t.firstMessageAt));
    const replied = messaged.filter(reached.replied);
    const touched = threads.filter((t) => inRange(t.createdAt) || inRange(t.lastOutboundAt) || inRange(t.lastInboundAt));

    const kpi = {
      connections: out.filter((a) => a.type === "connection_request").length,
      acceptance: pct(connSent.filter((t) => !!t.connectionAcceptedAt).length, connSent.length),
      dms: out.filter((a) => MESSAGE_TYPES.includes(a.type)).length,
      replyRate: pct(replied.length, messaged.length),
      positiveRate: pct(replied.filter(positive).length, replied.length),
      booked: threads.filter((t) => reached.booked(t) && inRange(t.updatedAt)).length,
      won: threads.filter((t) => reached.won(t) && inRange(t.updatedAt)).length,
    };

    const funnel = [
      { label: "In outreach", value: touched.length, color: STAGE_COLOR.not_contacted },
      { label: "Contacted", value: touched.filter(reached.contacted).length, color: STAGE_COLOR.connection_sent },
      { label: "Connected", value: touched.filter(reached.connected).length, color: STAGE_COLOR.connected },
      { label: "Messaged", value: touched.filter(reached.messaged).length, color: STAGE_COLOR.message_sent },
      { label: "Replied", value: touched.filter(reached.replied).length, color: STAGE_COLOR.replied },
      { label: "Interested", value: touched.filter(reached.interested).length, color: STAGE_COLOR.interested },
      { label: "Call booked", value: touched.filter(reached.booked).length, color: STAGE_COLOR.call_booked },
      { label: "Won", value: touched.filter(reached.won).length, color: STAGE_COLOR.won },
    ];

    const templates = data.templates
      .map((tpl) => {
        const sent = messaged.filter((t) => t.templateId === tpl.id);
        const rep = sent.filter(reached.replied);
        return { id: tpl.id, name: tpl.name, sent: sent.length, replies: rep.length, rate: pct(rep.length, sent.length), positive: pct(rep.filter(positive).length, rep.length) };
      })
      .filter((x) => x.sent > 0)
      .sort((a, b) => b.rate - a.rate || b.sent - a.sent);

    const owners = [...new Set(threads.map((t) => t.ownerId).filter(Boolean))] as string[];
    const board = owners
      .map((uid) => {
        const mine = threads.filter((t) => t.ownerId === uid);
        const myOut = out.filter((a) => a.userId === uid);
        const myMsg = mine.filter((t) => inRange(t.firstMessageAt));
        return {
          uid,
          name: userById(uid)?.name ?? "Unknown",
          connections: myOut.filter((a) => a.type === "connection_request").length,
          dms: myOut.filter((a) => MESSAGE_TYPES.includes(a.type)).length,
          replyRate: pct(myMsg.filter(reached.replied).length, myMsg.length),
          booked: mine.filter((t) => reached.booked(t) && inRange(t.updatedAt)).length,
          won: mine.filter((t) => reached.won(t) && inRange(t.updatedAt)).length,
        };
      })
      .sort((a, b) => b.booked - a.booked || b.won - a.won || b.dms - a.dms);

    return { kpi, funnel, templates, board };
  }, [data, range, repId, platform, campaignId, templateId, userById]);

  const usedPlatforms = PLATFORMS.filter((p) => data.threads.some((t) => t.platform === p.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect value={platform} onChange={(e) => setPlatform(e.target.value)} active={!!platform} onPage>
          <option value="">All platforms</option>
          {usedPlatforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={campaignId} onChange={(e) => setCampaignId(e.target.value)} active={!!campaignId} onPage>
          <option value="">All campaigns</option>
          {data.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect value={templateId} onChange={(e) => setTemplateId(e.target.value)} active={!!templateId} onPage>
          <option value="">All templates</option>
          {data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </FilterSelect>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UserPlus} label="Connections sent" value={r.kpi.connections} hint={`${r.kpi.acceptance}% accepted`} />
        <StatCard icon={Handshake} label="Acceptance rate" value={`${r.kpi.acceptance}%`} hint="Of requests sent in range" />
        <StatCard icon={Send} label="DMs sent" value={r.kpi.dms} hint="Incl. follow-ups" />
        <StatCard icon={MessageSquareReply} label="Reply rate" value={`${r.kpi.replyRate}%`} hint="Of first DMs in range" />
        <StatCard icon={SmilePlus} label="Positive replies" value={`${r.kpi.positiveRate}%`} hint="Of replies" />
        <StatCard icon={CalendarCheck2} label="Calls booked" value={r.kpi.booked} />
        <StatCard icon={Trophy} label="Deals won" value={r.kpi.won} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Outreach funnel" subtitle="Threads active in this range, by the furthest stage they reached" />
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={r.funnel} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid horizontal={false} stroke="#EFEFEF" />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fill: "#A3A3A3", fontSize: 12 }} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#6B6B6B", fontSize: 12.5 }} width={92} />
                <Tooltip cursor={{ fill: "rgb(var(--brand-500) / 0.07)" }} contentStyle={tooltipStyle} formatter={(v: number) => [v, "Threads"]} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                  {r.funnel.map((f) => (
                    <Cell key={f.label} fill={f.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reply rate by template" subtitle="A/B test your openers — first DMs sent in this range" />
          {r.templates.length === 0 ? (
            <p className="rounded-2xl bg-soft px-5 py-10 text-center text-[13.5px] text-neutral-500">No DMs sent with a template in this range yet.</p>
          ) : (
            <>
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.templates} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
                    <CartesianGrid vertical={false} stroke="#EFEFEF" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#8A8A8A", fontSize: 12 }} dy={8} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fill: "#A3A3A3", fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <Tooltip cursor={{ fill: "rgb(var(--brand-500) / 0.07)" }} contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "Reply rate"]} />
                    <Bar dataKey="rate" fill="rgb(var(--brand-500))" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-5 w-full text-[13px]">
                <thead className="text-left text-[12px] text-neutral-400">
                  <tr>
                    <th className="pb-2 font-normal">Template</th>
                    <th className="pb-2 text-right font-normal">Sent</th>
                    <th className="pb-2 text-right font-normal">Replies</th>
                    <th className="pb-2 text-right font-normal">Reply %</th>
                    <th className="pb-2 text-right font-normal">Positive %</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {r.templates.map((t) => (
                    <tr key={t.id} className="border-t border-neutral-100">
                      <td className="py-2.5">{t.name}</td>
                      <td className="py-2.5 text-right">{t.sent}</td>
                      <td className="py-2.5 text-right">{t.replies}</td>
                      <td className="py-2.5 text-right">{t.rate}%</td>
                      <td className="py-2.5 text-right">{t.positive}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Leaderboard" subtitle="Ranked by calls booked, then deals won" />
        {r.board.length === 0 ? (
          <p className="rounded-2xl bg-soft px-5 py-10 text-center text-[13.5px] text-neutral-500">No social outreach yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13.5px]">
              <thead className="text-left text-[12px] text-neutral-400">
                <tr>
                  <th className="pb-3 font-normal">#</th>
                  <th className="pb-3 font-normal">Rep</th>
                  <th className="pb-3 text-right font-normal">Connections</th>
                  <th className="pb-3 text-right font-normal">DMs</th>
                  <th className="pb-3 text-right font-normal">Reply %</th>
                  <th className="pb-3 text-right font-normal">Booked</th>
                  <th className="pb-3 text-right font-normal">Won</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {r.board.map((b, i) => (
                  <tr key={b.uid} className="border-t border-neutral-100">
                    <td className="py-3 text-neutral-400">{i + 1}</td>
                    <td className="py-3">{b.name}</td>
                    <td className="py-3 text-right">{b.connections}</td>
                    <td className="py-3 text-right">{b.dms}</td>
                    <td className="py-3 text-right">{b.replyRate}%</td>
                    <td className="py-3 text-right">{b.booked}</td>
                    <td className="py-3 text-right">{b.won}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
