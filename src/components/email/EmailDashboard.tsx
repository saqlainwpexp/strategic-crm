"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, AtSign, Ban, Inbox, MailCheck, MailOpen, MessageSquareReply, MousePointerClick, Plus, Send, Workflow } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";
import { StatCard, EmptyState } from "@/components/ui/Layout";
import { greetingFor, zonedParts } from "@/lib/date";
import { pct } from "@/lib/email";
import type { EmailOverview } from "@/lib/email-types";
import { ACCOUNT_STATUS, CampaignStatusLabel, Meter, RateCell } from "./kit";

const tooltipStyle = { borderRadius: 14, border: "none", boxShadow: "0 12px 32px rgba(10,10,10,0.14)", fontSize: 12, padding: "10px 14px" };

export function EmailDashboard({ data }: { data: EmailOverview }) {
  const { viewer } = useCrm();
  const { hour } = zonedParts();
  const s = data.stats;
  const series = data.daily.map((d) => ({
    label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
    Delivered: d.sent - d.opened,
    Opened: d.opened,
  }));
  const anySent = data.daily.some((d) => d.sent > 0);
  const setupDone = data.accounts.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-6 pb-8 pt-6">
        <div>
          <h1 className="text-[34px] font-normal leading-tight tracking-[-0.025em] md:text-[42px]">
            {greetingFor(hour)}, {viewer.name.split(" ")[0]}!
          </h1>
          <p className="mt-2 text-[15px] text-neutral-500">Email marketing · last 30 days</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.unreadReplies > 0 && (
            <Link href="/email/inbox?folder=unread" className={buttonClass("secondary", "lg")}>
              <Inbox className="h-4 w-4" /> {data.unreadReplies} new repl{data.unreadReplies === 1 ? "y" : "ies"}
            </Link>
          )}
          <Link href="/email/campaigns/new" className={buttonClass("primary", "lg")}>
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        </div>
      </div>

      {!setupDone && (
        <Card className="mb-6 flex flex-wrap items-center gap-6 p-8">
          <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-brand text-brand-fg">
            <AtSign className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-medium tracking-[-0.01em]">Connect a mailbox to start sending</p>
            <p className="mt-1.5 text-[14px] text-neutral-500">Add your Hostinger (or Gmail / Outlook) email account. Your CRM leads with an email address are already your contacts.</p>
          </div>
          <Link href="/email/sending?new=1" className={buttonClass("primary", "lg")}>
            Add mailbox <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={MailCheck} label="Delivered" value={s.sent.toLocaleString("en-US")} hint={s.queued ? `${s.queued.toLocaleString("en-US")} queued` : "Nothing queued"} />
        <StatCard icon={MailOpen} label="Open rate" value={`${pct(s.opened, s.sent)}%`} hint={`${s.opened.toLocaleString("en-US")} opened`} />
        <StatCard icon={MousePointerClick} label="Click rate" value={`${pct(s.clicked, s.sent)}%`} hint={`${s.clicked.toLocaleString("en-US")} clicked`} />
        <StatCard icon={MessageSquareReply} label="Reply rate" value={`${pct(s.replied, s.sent)}%`} hint={`${s.replied.toLocaleString("en-US")} replies`} />
        <StatCard icon={Ban} label="Bounce rate" value={`${pct(s.bounced, s.sent)}%`} hint={`${s.unsubscribed} unsubscribed`} />
        <StatCard icon={Send} label="Mailable contacts" value={s.mailable.toLocaleString("en-US")} hint={`of ${s.contacts.toLocaleString("en-US")} with an email`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Sending activity" subtitle="Emails delivered per day, and how many were opened" />
          {anySent ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
                  <CartesianGrid vertical={false} stroke="#EFEFEF" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8A8A8A", fontSize: 12 }} dy={8} interval={4} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: "#A3A3A3", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip cursor={{ fill: "rgb(var(--brand-500) / 0.07)" }} contentStyle={tooltipStyle} />
                  <Bar isAnimationActive={false} dataKey="Opened" stackId="s" fill="rgb(var(--brand-500))" />
                  <Bar isAnimationActive={false} dataKey="Delivered" stackId="s" fill="rgb(var(--ink))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={Send} title="No emails sent in the last 30 days" body="Your daily sending and opens will chart here." />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Mailboxes"
            subtitle="Today's sending"
            actions={
              <Link href="/email/sending" className="text-[13px] text-neutral-500 hover:text-ink">
                Manage
              </Link>
            }
          />
          {data.accounts.length === 0 ? (
            <p className="text-[13.5px] text-neutral-500">No mailboxes yet.</p>
          ) : (
            <ul className="flex flex-col gap-5">
              {data.accounts.map((a) => (
                <li key={a.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[13.5px] font-medium">{a.email}</span>
                    <span className="shrink-0 text-[12px] tabular-nums text-neutral-500">
                      {a.sentToday}/{a.dailyLimit}
                    </span>
                  </div>
                  <Meter className="mt-2" value={a.sentToday} max={a.dailyLimit} />
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-neutral-500">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCOUNT_STATUS[a.status].color }} />
                    {ACCOUNT_STATUS[a.status].label}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-7 flex items-center gap-3 rounded-2xl bg-soft p-4">
            <Workflow className="h-4 w-4" />
            <span className="text-[13px]">
              {data.activeAutomations} automation{data.activeAutomations === 1 ? "" : "s"} live
            </span>
            <Link href="/email/automations" className="ml-auto text-[12.5px] text-neutral-500 hover:text-ink">
              View
            </Link>
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-0">
        <div className="flex items-center justify-between gap-4 px-7 pb-5 pt-6">
          <h2 className="text-[18px] font-medium tracking-[-0.01em]">Recent campaigns</h2>
          <Link href="/email/campaigns" className="text-[13px] text-neutral-500 hover:text-ink">
            All campaigns
          </Link>
        </div>
        {data.campaigns.length === 0 ? (
          <EmptyState icon={Send} title="No campaigns yet" className="pb-14" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="text-left text-[12.5px] text-neutral-700">
                  {["Campaign", "Status", "Delivered", "Opened", "Clicked", "Replied"].map((h, i) => (
                    <th key={h} className={`border-y border-neutral-100 py-3.5 pr-4 font-normal ${i === 0 ? "pl-7" : ""}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {data.campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-4 pl-7 pr-4">
                      <Link href={`/email/campaigns/${c.id}`} className="block max-w-[320px] truncate font-medium hover:underline">
                        {c.name}
                      </Link>
                      <p className="mt-0.5 max-w-[320px] truncate text-[11.5px] text-neutral-500">{c.subject}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <CampaignStatusLabel status={c.status} />
                    </td>
                    <td className="py-4 pr-4 tabular-nums">
                      {c.stats.sent.toLocaleString("en-US")}
                      {c.stats.total > 0 && <span className="text-neutral-500"> / {c.stats.total.toLocaleString("en-US")}</span>}
                    </td>
                    <td className="py-4 pr-4">
                      <RateCell part={c.stats.opened} whole={c.stats.sent} />
                    </td>
                    <td className="py-4 pr-4">
                      <RateCell part={c.stats.clicked} whole={c.stats.sent} />
                    </td>
                    <td className="py-4 pr-7">
                      <RateCell part={c.stats.replied} whole={c.stats.sent} />
                    </td>
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
