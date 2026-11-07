"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Linkedin,
  MessageSquare,
  Pause,
  Send,
  ShieldAlert,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import type { LinkedInOverview } from "@/server/linkedin/load";
import type { LiAccountStatus } from "@prisma/client";

const STATUS_LABEL: Record<LiAccountStatus, string> = {
  WARMING: "Warming up",
  ACTIVE: "Active",
  PAUSED: "Paused",
  RESTRICTED: "Restricted",
};

const STATUS_COLOR: Record<LiAccountStatus, string> = {
  WARMING: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-neutral-100 text-neutral-600",
  RESTRICTED: "bg-rose-100 text-rose-700",
};

const STATUS_DOT: Record<LiAccountStatus, string> = {
  WARMING: "bg-amber-400",
  ACTIVE: "bg-emerald-400",
  PAUSED: "bg-neutral-400",
  RESTRICTED: "bg-rose-400",
};

export function LinkedInDashboard({ data }: { data: LinkedInOverview }) {
  const activeAccounts = data.accounts.filter((a) => a.status === "ACTIVE").length;
  const warmingAccounts = data.accounts.filter((a) => a.status === "WARMING").length;
  const restrictedAccounts = data.accounts.filter((a) => a.status === "RESTRICTED").length;
  const activeCampaigns = data.campaigns.filter((c) => c.status === "ACTIVE").length;

  const stats = [
    { icon: Users, label: "Sender accounts", value: data.accounts.length, hint: `${activeAccounts} active`, href: "/linkedin/accounts" },
    { icon: Send, label: "Active campaigns", value: activeCampaigns, hint: `${data.campaigns.length} total`, href: "/linkedin/campaigns" },
    { icon: Users, label: "Total prospects", value: data.prospectCount.toLocaleString(), hint: "Unique profiles", href: "/linkedin/prospects" },
    { icon: Inbox, label: "Unread messages", value: data.unreadCount, hint: "Across all accounts", href: "/linkedin/inbox" },
  ];

  return (
    <div>
      <PageHeader
        title={<span className="flex items-center gap-3"><Linkedin className="h-8 w-8 text-[#0A66C2]" strokeWidth={1.5} />Strategic LinkedIn</span>}
        subtitle="Manage outreach campaigns across all LinkedIn sender accounts"
        actions={
          <Link
            href="/linkedin/campaigns?new=1"
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0A66C2] px-6 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
          >
            <Send className="h-4 w-4" strokeWidth={1.8} />
            New campaign
          </Link>
        }
      />

      {restrictedAccounts > 0 && (
        <div className="mb-8 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" strokeWidth={1.8} />
          <div>
            <p className="text-[14px] font-medium text-rose-800">{restrictedAccounts} account{restrictedAccounts > 1 ? "s" : ""} restricted — check immediately</p>
            <p className="mt-0.5 text-[13px] text-rose-600">LinkedIn may have flagged these accounts. Review them in <Link href="/linkedin/accounts" className="underline">Accounts</Link>.</p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="group rounded-2xl border border-black/[0.06] bg-white p-5 transition-shadow hover:shadow-md">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-page">
              <s.icon className="h-5 w-5 text-ink" strokeWidth={1.8} />
            </div>
            <p className="text-[28px] font-semibold leading-none tracking-tight">{s.value}</p>
            <p className="mt-1.5 text-[13px] font-medium">{s.label}</p>
            <p className="mt-0.5 text-[12px] text-neutral-500">{s.hint}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Accounts */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Sender accounts</h2>
            <Link href="/linkedin/accounts" className="text-[13px] text-neutral-500 hover:text-ink">Manage →</Link>
          </div>
          {data.accounts.length === 0 ? (
            <EmptyState icon={Users} title="No accounts yet" hint="Add a LinkedIn sender account to get started" href="/linkedin/accounts?new=1" cta="Add account" />
          ) : (
            <div className="space-y-2">
              {data.accounts.slice(0, 6).map((acc) => (
                <div key={acc.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-page">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[acc.status])} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{acc.name}</p>
                    <p className="text-[12px] text-neutral-500">{acc.ownerName || acc.linkedinEmail}</p>
                  </div>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", STATUS_COLOR[acc.status])}>
                    {STATUS_LABEL[acc.status]}
                  </span>
                  <div className="text-right text-[12px] text-neutral-400">
                    <p>{acc.connectsToday}/{acc.maxDailyConnects} connects</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaigns */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Campaigns</h2>
            <Link href="/linkedin/campaigns" className="text-[13px] text-neutral-500 hover:text-ink">Manage →</Link>
          </div>
          {data.campaigns.length === 0 ? (
            <EmptyState icon={Send} title="No campaigns yet" hint="Create your first outreach sequence" href="/linkedin/campaigns?new=1" cta="New campaign" />
          ) : (
            <div className="space-y-2">
              {data.campaigns.slice(0, 6).map((c) => (
                <Link key={c.id} href={`/linkedin/campaigns/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-page">
                  <span className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    c.status === "ACTIVE" ? "bg-emerald-400" : c.status === "PAUSED" ? "bg-amber-400" : "bg-neutral-300"
                  )} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">{c.name}</p>
                    <p className="text-[12px] text-neutral-500">{c.status.charAt(0) + c.status.slice(1).toLowerCase()}</p>
                  </div>
                  <span className="text-[12px] text-neutral-400">
                    {(c.steps as unknown[]).length} step{(c.steps as unknown[]).length !== 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-black/[0.06] bg-white p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Recent activity</h2>
          </div>
          {data.recentActions.length === 0 ? (
            <div className="py-8 text-center">
              <Activity className="mx-auto h-8 w-8 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-[14px] text-neutral-500">No actions logged yet</p>
              <p className="mt-1 text-[13px] text-neutral-400">Actions will appear here once campaigns start running</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {data.recentActions.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-3">
                  <span className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px]",
                    a.status === "DONE" ? "bg-emerald-50 text-emerald-600" :
                    a.status === "FAILED" ? "bg-rose-50 text-rose-600" :
                    a.status === "RUNNING" ? "bg-blue-50 text-blue-600" : "bg-neutral-100 text-neutral-500"
                  )}>
                    {a.status === "DONE" ? <CheckCircle2 className="h-4 w-4" strokeWidth={1.8} /> :
                     a.status === "FAILED" ? <AlertTriangle className="h-4 w-4" strokeWidth={1.8} /> :
                     a.status === "RUNNING" ? <Zap className="h-4 w-4" strokeWidth={1.8} /> :
                     <Clock className="h-4 w-4" strokeWidth={1.8} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px]">
                      <span className="font-medium">{a.account.name}</span>
                      {" · "}
                      <span className="capitalize text-neutral-600">{a.type.replace(/_/g, " ").toLowerCase()}</span>
                      {a.prospect && ` → ${a.prospect.firstName} ${a.prospect.lastName}${a.prospect.company ? ` at ${a.prospect.company}` : ""}`}
                    </p>
                    {a.dryRun && <p className="text-[11.5px] text-amber-600">Dry-run mode — action not sent to LinkedIn</p>}
                    {a.error && <p className="truncate text-[11.5px] text-rose-600">{a.error}</p>}
                  </div>
                  <span className="shrink-0 text-[12px] text-neutral-400">
                    {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Safety reminder */}
      <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <div className="flex items-start gap-3">
          <Pause className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" strokeWidth={1.8} />
          <div>
            <p className="text-[14px] font-medium text-amber-800">Safety reminder</p>
            <p className="mt-1 text-[13px] text-amber-700">
              Accounts running in <strong>dry-run mode</strong> — no real actions are sent to LinkedIn until you wire up the Playwright worker on your VPS.
              Warmed accounts: max 15–20 connects/day. New accounts: max 5–10 connects/day. Keep pending invites under 500.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint, href, cta }: { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; title: string; hint: string; href: string; cta: string }) {
  return (
    <div className="py-8 text-center">
      <Icon className="mx-auto h-8 w-8 text-neutral-300" strokeWidth={1.5} />
      <p className="mt-3 text-[14px] text-neutral-500">{title}</p>
      <p className="mt-1 text-[13px] text-neutral-400">{hint}</p>
      <Link href={href} className="mt-4 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] text-white hover:bg-ink-muted">
        {cta}
      </Link>
    </div>
  );
}
