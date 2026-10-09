"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, CircleAlert, Copy, MailCheck, MailOpen, MessageSquareReply, MousePointerClick, Pause, Play, Send, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Form";
import { StatCard, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { StatusDot } from "@/components/ui/Badges";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/date";
import { audienceSummary, pct } from "@/lib/email";
import type { CampaignView, EmailAccountView, RecipientView } from "@/lib/email-types";
import { duplicateCampaignAction, processQueueNowAction, setCampaignStatusAction } from "@/server/email/actions";
import { EmailPreview } from "./EmailPreview";
import { CampaignStatusLabel, Meter, useEmailAction } from "./kit";

type Filter = "all" | "opened" | "clicked" | "replied" | "bounced" | "failed" | "queued";

export function recipientState(r: RecipientView): { label: string; color: string } {
  if (r.bouncedAt) return { label: "Bounced", color: "#E11D48" };
  if (r.repliedAt) return { label: "Replied", color: "#7C3AED" };
  if (r.clickedAt) return { label: "Clicked", color: "#2563EB" };
  if (r.openedAt) return { label: "Opened", color: "#1F9D4C" };
  if (r.status === "SENT") return { label: "Delivered", color: "#525252" };
  if (r.status === "FAILED") return { label: "Failed", color: "#E5484D" };
  if (r.status === "SKIPPED") return { label: "Skipped", color: "#A3A3A3" };
  return { label: r.status === "SENDING" ? "Sending" : "Queued", color: "#D4D4D4" };
}

export function CampaignReport({ campaign, recipients, accounts }: { campaign: CampaignView; recipients: RecipientView[]; accounts: EmailAccountView[] }) {
  const router = useRouter();
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const s = campaign.stats;
  const live = campaign.status === "SENDING";

  // Keep numbers fresh while it's going out.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [live, router]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return recipients.filter((r) => {
      if (term && !`${r.businessName} ${r.email} ${r.contactName}`.toLowerCase().includes(term)) return false;
      switch (filter) {
        case "opened": return !!r.openedAt;
        case "clicked": return !!r.clickedAt;
        case "replied": return !!r.repliedAt;
        case "bounced": return !!r.bouncedAt;
        case "failed": return r.status === "FAILED" || r.status === "SKIPPED";
        case "queued": return r.status === "QUEUED" || r.status === "SENDING";
        default: return true;
      }
    });
  }, [recipients, filter, q]);

  const accountsUsed = accounts.filter((a) => campaign.accountIds.includes(a.id));
  const blocked = live && s.queued > 0 && accountsUsed.every((a) => a.status === "ERROR" || a.status === "DISCONNECTED" || a.sentToday >= a.dailyLimit);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-6">
        <div className="min-w-0">
          <Link href="/email/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Campaigns
          </Link>
          <h1 className="text-[34px] font-normal leading-[1.1] tracking-[-0.025em] md:text-[40px]">{campaign.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-neutral-500">
            <CampaignStatusLabel status={campaign.status} />
            {campaign.startedAt && <span>Started {formatDateTime(campaign.startedAt)}</span>}
            {campaign.finishedAt && <span>Finished {formatDateTime(campaign.finishedAt)}</span>}
            <span>{audienceSummary(campaign.audience)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {live && (
            <Button variant="secondary" size="lg" disabled={busy === "pause"} onClick={() => run("pause", setCampaignStatusAction(campaign.id, "pause"), "Campaign paused")}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          )}
          {campaign.status === "PAUSED" && (
            <Button size="lg" disabled={busy === "resume"} onClick={() => run("resume", setCampaignStatusAction(campaign.id, "resume"), "Sending resumed")}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          )}
          {(live || campaign.status === "PAUSED") && (
            <Button
              variant="danger"
              size="lg"
              onClick={() =>
                confirm({
                  title: "Cancel this campaign?",
                  body: `${s.queued.toLocaleString("en-US")} emails that haven't gone out yet won't be sent. This can't be undone.`,
                  confirmLabel: "Cancel campaign",
                  danger: true,
                  run: () => run("cancel", setCampaignStatusAction(campaign.id, "cancel"), "Campaign cancelled"),
                })
              }
            >
              <Ban className="h-4 w-4" /> Cancel
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={async () => {
              const r = await run("dup", duplicateCampaignAction(campaign.id), "Copied to a new draft");
              if (r) router.push(`/email/campaigns/${r.id}`);
            }}
          >
            <Copy className="h-4 w-4" /> Duplicate
          </Button>
        </div>
      </div>

      {live && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[15px] font-medium">
                Sending… {s.sent.toLocaleString("en-US")} of {s.total.toLocaleString("en-US")} delivered
              </p>
              <p className="mt-1 text-[13px] text-neutral-500">{s.queued.toLocaleString("en-US")} still queued · this page updates every 10 seconds</p>
            </div>
            <Button variant="ghost" size="sm" disabled={busy === "tick"} onClick={() => run("tick", processQueueNowAction())}>
              <Send className="h-3.5 w-3.5" /> Nudge queue
            </Button>
          </div>
          <Meter className="mt-5 h-2" value={s.sent + s.failed + s.skipped} max={s.total} />
          {blocked && (
            <p className="mt-5 flex items-start gap-2.5 rounded-2xl bg-amber-50 px-4 py-3.5 text-[13px] text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Every mailbox on this campaign has hit its daily limit or needs attention, so sending is waiting.{" "}
              <Link href="/email/sending" className="underline underline-offset-2">
                Check mailboxes
              </Link>
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={Users} label="Recipients" value={s.total.toLocaleString("en-US")} hint={`${s.skipped} skipped`} />
        <StatCard icon={MailCheck} label="Delivered" value={s.sent.toLocaleString("en-US")} hint={s.failed ? `${s.failed} failed` : "No failures"} />
        <StatCard icon={MailOpen} label="Opened" value={`${pct(s.opened, s.sent)}%`} hint={`${s.opened.toLocaleString("en-US")} people`} />
        <StatCard icon={MousePointerClick} label="Clicked" value={`${pct(s.clicked, s.sent)}%`} hint={`${s.clicked.toLocaleString("en-US")} people`} />
        <StatCard icon={MessageSquareReply} label="Replied" value={`${pct(s.replied, s.sent)}%`} hint={`${s.replied.toLocaleString("en-US")} replies`} />
        <StatCard icon={Ban} label="Bounced" value={`${pct(s.bounced, s.sent)}%`} hint={`${s.bounced.toLocaleString("en-US")} addresses`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
            <Segmented
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: recipients.length },
                { value: "opened", label: "Opened", count: s.opened },
                { value: "clicked", label: "Clicked", count: s.clicked },
                { value: "replied", label: "Replied", count: s.replied },
                { value: "bounced", label: "Bounced", count: s.bounced },
                { value: "failed", label: "Failed", count: s.failed + s.skipped },
                { value: "queued", label: "Queued", count: s.queued },
              ]}
            />
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipients" className="h-10 w-full md:w-[240px]" />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={Users} title="Nobody here yet" className="pb-16" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead>
                  <tr className="text-left text-[12.5px] text-neutral-700">
                    {["Contact", "Status", "Sent", "Opens", "From", ""].map((h, i) => (
                      <th key={i} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {rows.slice(0, 500).map((r) => {
                    const st = recipientState(r);
                    return (
                      <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                        <td className="py-3.5 pl-7 pr-4">
                          <p className="max-w-[260px] truncate font-medium">{r.businessName}</p>
                          <p className="mt-0.5 max-w-[260px] truncate text-[11.5px] text-neutral-500">{r.email}</p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <StatusDot color={st.color} label={st.label} />
                          {r.error && <p className="mt-1 max-w-[220px] truncate text-[11.5px] text-neutral-500" title={r.error}>{r.error}</p>}
                        </td>
                        <td className="whitespace-nowrap py-3.5 pr-4 text-neutral-600">{r.sentAt ? formatDateTime(r.sentAt) : "—"}</td>
                        <td className="py-3.5 pr-4 tabular-nums">{r.openCount || "—"}</td>
                        <td className="max-w-[180px] truncate py-3.5 pr-4 text-neutral-600">{r.accountEmail ?? "—"}</td>
                        <td className="py-3.5 pr-7 text-right">
                          {r.leadId && (
                            <Link href={`/email/contacts?contact=${r.leadId}`} className="text-[12.5px] text-neutral-500 underline-offset-4 hover:text-ink hover:underline">
                              View
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 500 && <p className="px-7 py-4 text-[12.5px] text-neutral-500">Showing the first 500 — use the filters or search to narrow down.</p>}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="px-7 pb-4 pt-6">
            <CardHeader title="What was sent" subtitle={campaign.subject} className="mb-0" />
          </div>
          <div className="border-t border-neutral-100">
            <EmailPreview html={campaign.html} height={560} />
          </div>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
