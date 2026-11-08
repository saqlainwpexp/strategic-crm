"use client";

import Link from "next/link";
import { BellRing, Briefcase, CalendarClock, MessagesSquare, Reply, Send } from "lucide-react";
import type { LogAccount, LogCampaign } from "@prisma/client";
import type { DueItem } from "@/server/outreach-log/service";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/Layout";
import { Button, buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { channelLabel, jobSourceLabel } from "@/lib/outreach-log/constants";
import { CampaignChip, ChannelTag, DueText, StagePill } from "./shared";

const REASON: Record<DueItem["reason"], string> = {
  reply_waiting: "Reply waiting on you",
  followup_due: "Follow-up due",
  interview_followup: "Post-interview follow-up",
  check_in: "Check in",
};

export function TodayView({
  due,
  accounts,
  counts,
  totals,
  campaigns,
}: {
  due: DueItem[];
  accounts: LogAccount[];
  counts: { accountId: string; sent: number; limit: number }[];
  totals: { contacts: number; jobs: number; activeContacts: number; activeJobs: number };
  campaigns: LogCampaign[];
}) {
  const replies = due.filter((d) => d.reason === "reply_waiting");
  const rest = due.filter((d) => d.reason !== "reply_waiting");
  const accountLabel = (id: string | null) => accounts.find((a) => a.id === id)?.label ?? null;

  const Row = ({ it }: { it: DueItem }) => (
    <Link
      href={it.kind === "contact" ? `/log/outreach?contact=${it.id}` : `/log/jobs?job=${it.id}`}
      className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-black/[0.05] px-6 py-4 transition-colors first:border-t-0 hover:bg-page/60"
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", it.kind === "job" ? "bg-violet-50 text-violet-700" : "bg-page text-ink")}>
        {it.kind === "job" ? <Briefcase className="h-4 w-4" /> : <MessagesSquare className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-medium">{it.title}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">
          {REASON[it.reason]}
          {it.subtitle && ` · ${it.subtitle}`}
          {it.followupCount > 0 && ` · ${it.followupCount} follow-up${it.followupCount > 1 ? "s" : ""} sent`}
        </span>
      </span>
      <span className="w-[200px] min-w-0">
        {it.kind === "contact" ? <ChannelTag channel={it.channel} account={accountLabel(it.accountId)} /> : <span className="text-[13px] text-neutral-600">{jobSourceLabel(it.channel)}</span>}
      </span>
      <span className="hidden w-[170px] md:block">{it.kind === "contact" && <CampaignChip campaign={campaigns.find((c) => c.id === it.campaignId) ?? null} />}</span>
      <StagePill kind={it.kind} stage={it.stage} />
      <DueText at={it.dueAt} className="w-[96px] text-right" />
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Today"
        subtitle="Replies waiting and follow-ups due across WhatsApp, email, DMs and job applications."
        actions={
          <>
            <Link href="/log/jobs?new=1" className={buttonClass("secondary")}>
              <Briefcase className="h-4 w-4" /> Log application
            </Link>
            <Link href="/log/outreach?new=1" className={buttonClass("primary")}>
              <Send className="h-4 w-4" /> Log outreach
            </Link>
          </>
        }
      />

      <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Reply} label="Replies waiting" value={replies.length} />
        <StatCard icon={CalendarClock} label="Follow-ups due" value={rest.length} />
        <StatCard icon={MessagesSquare} label="Active outreach" value={totals.activeContacts} hint={`${totals.contacts} contacts logged`} />
        <StatCard icon={Briefcase} label="Active applications" value={totals.activeJobs} hint={`${totals.jobs} jobs logged`} />
      </div>

      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {replies.length > 0 && (
            <section>
              <h2 className="mb-4 text-[17px] font-medium">Replies waiting</h2>
              <Card className="p-0">{replies.map((it) => <Row key={it.kind + it.id} it={it} />)}</Card>
            </section>
          )}
          <section>
            <h2 className="mb-4 text-[17px] font-medium">Follow-ups due</h2>
            <Card className="p-0">
              {rest.length ? (
                rest.map((it) => <Row key={it.kind + it.id} it={it} />)
              ) : (
                <EmptyState icon={BellRing} title="You're all caught up" body="New follow-ups appear here automatically when they're due — and your Claude agent gets a signal if one is connected." />
              )}
            </Card>
          </section>
        </div>

        <aside>
          <h2 className="mb-4 text-[17px] font-medium">Sent today by account</h2>
          <Card className="space-y-5">
            {accounts.length === 0 && (
              <div className="text-[13.5px] leading-relaxed text-neutral-500">
                Add your sending accounts — e.g. 3 WhatsApp numbers or 2 Facebook profiles — to track sends and limits per account.
                <div className="mt-4">
                  <Link href="/log/accounts?new=1"><Button size="sm">Add account</Button></Link>
                </div>
              </div>
            )}
            {accounts.map((a) => {
              const c = counts.find((x) => x.accountId === a.id);
              const sent = c?.sent ?? 0;
              const pct = a.dailyLimit ? Math.min(100, (sent / a.dailyLimit) * 100) : 0;
              return (
                <div key={a.id}>
                  <div className="flex items-center justify-between gap-3">
                    <ChannelTag channel={a.channel} account={a.label} />
                    <span className="text-[13px] tabular-nums text-neutral-600">
                      {sent}
                      {a.dailyLimit ? ` / ${a.dailyLimit}` : ""}
                    </span>
                  </div>
                  {a.dailyLimit > 0 && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-page">
                      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-ink")} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
          <p className="mt-4 text-[12.5px] leading-relaxed text-neutral-400">
            Channels: {["whatsapp", "email", "linkedin", "facebook", "instagram", "x"].map(channelLabel).join(", ")} and more.
          </p>
        </aside>
      </div>
    </div>
  );
}
