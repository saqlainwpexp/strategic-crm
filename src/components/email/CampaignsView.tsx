"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { RenameModal, RowMenu } from "@/components/ui/RowMenu";
import { Card } from "@/components/ui/Card";
import { IconButton, buttonClass } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/Form";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { dayLabel, dayKey, formatTime } from "@/lib/date";
import { audienceSummary } from "@/lib/email";
import type { CampaignStatus, CampaignView } from "@/lib/email-types";
import { deleteCampaignAction, duplicateCampaignAction, renameCampaignAction } from "@/server/email/actions";
import { CampaignStatusLabel, Meter, RateCell, useEmailAction } from "./kit";

type Filter = "all" | "draft" | "scheduled" | "active" | "sent";
const MATCH: Record<Filter, CampaignStatus[] | null> = {
  all: null,
  draft: ["DRAFT"],
  scheduled: ["SCHEDULED"],
  active: ["SENDING", "PAUSED"],
  sent: ["SENT", "CANCELLED"],
};

function when(c: CampaignView) {
  const iso = c.status === "SCHEDULED" ? c.scheduledAt : c.finishedAt ?? c.startedAt ?? c.updatedAt;
  if (!iso) return "—";
  const prefix = c.status === "SCHEDULED" ? "Sends " : c.status === "DRAFT" ? "Edited " : "";
  return `${prefix}${dayLabel(dayKey(iso))}, ${formatTime(iso)}`;
}

export function CampaignsView({ campaigns }: { campaigns: CampaignView[] }) {
  const router = useRouter();
  const { run } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState<CampaignView | null>(null);

  const counts = useMemo(() => {
    const c = { all: campaigns.length, draft: 0, scheduled: 0, active: 0, sent: 0 } as Record<Filter, number>;
    for (const x of campaigns) for (const f of ["draft", "scheduled", "active", "sent"] as Filter[]) if (MATCH[f]!.includes(x.status)) c[f]++;
    return c;
  }, [campaigns]);

  const rows = campaigns.filter(
    (c) =>
      (!MATCH[filter] || MATCH[filter]!.includes(c.status)) &&
      (!q.trim() || `${c.name} ${c.subject}`.toLowerCase().includes(q.trim().toLowerCase()))
  );

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="One-off emails to a list of contacts, sent at a safe pace from your mailboxes."
        actions={
          <Link href="/email/campaigns/new" className={buttonClass("primary", "lg")}>
            <Plus className="h-4 w-4" /> New campaign
          </Link>
        }
      />

      {campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Send}
            title="Send your first campaign"
            body="Pick who to email from your CRM leads, write the message (or start from a template), and we'll send it gradually from your mailboxes."
            action={
              <Link href="/email/campaigns/new" className={buttonClass("primary", "md")}>
                <Plus className="h-4 w-4" /> New campaign
              </Link>
            }
          />
        </Card>
      ) : (
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All", count: counts.all },
                { value: "draft", label: "Drafts", count: counts.draft },
                { value: "scheduled", label: "Scheduled", count: counts.scheduled },
                { value: "active", label: "Sending", count: counts.active },
                { value: "sent", label: "Sent", count: counts.sent },
              ]}
            />
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="h-11 w-full md:w-[300px]" />
          </div>
          {rows.length === 0 ? (
            <EmptyState icon={Send} title="No campaigns here" body="Try another tab or search." className="pb-16" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse">
                <thead>
                  <tr className="text-left text-[12.5px] text-neutral-700">
                    {["Campaign", "Status", "Recipients", "Progress", "Opened", "Clicked", "Replied", "When", ""].map((h, i) => (
                      <th key={i} className={`border-y border-neutral-100 py-3.5 pr-4 font-normal ${i === 0 ? "pl-7" : ""}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {rows.map((c) => {
                    const s = c.stats;
                    const done = s.sent + s.failed + s.skipped;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => router.push(`/email/campaigns/${c.id}`)}
                        className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/80"
                      >
                        <td className="py-4 pl-7 pr-4">
                          <p className="max-w-[300px] truncate font-medium text-ink">{c.name}</p>
                          <p className="mt-0.5 max-w-[300px] truncate text-[11.5px] text-neutral-500">{c.subject || "No subject yet"}</p>
                        </td>
                        <td className="py-4 pr-4">
                          <CampaignStatusLabel status={c.status} />
                        </td>
                        <td className="py-4 pr-4">
                          <p className="tabular-nums text-ink">{s.total ? s.total.toLocaleString("en-US") : "—"}</p>
                          <p className="mt-0.5 max-w-[200px] truncate text-[11.5px] text-neutral-500">{audienceSummary(c.audience)}</p>
                        </td>
                        <td className="w-[150px] py-4 pr-6">
                          {s.total ? (
                            <>
                              <p className="text-[12px] tabular-nums text-neutral-600">
                                {s.sent.toLocaleString("en-US")} / {s.total.toLocaleString("en-US")} sent
                              </p>
                              <Meter className="mt-2" value={done} max={s.total} />
                            </>
                          ) : (
                            <span className="text-neutral-400">—</span>
                          )}
                        </td>
                        <td className="py-4 pr-4">
                          <RateCell part={s.opened} whole={s.sent} />
                        </td>
                        <td className="py-4 pr-4">
                          <RateCell part={s.clicked} whole={s.sent} />
                        </td>
                        <td className="py-4 pr-4">
                          <RateCell part={s.replied} whole={s.sent} />
                        </td>
                        <td className="whitespace-nowrap py-4 pr-4 text-neutral-600">{when(c)}</td>
                        <td className="py-4 pr-7 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <RowMenu
                              items={[
                                { icon: Pencil, label: "Rename", onClick: () => setRenaming(c) },
                                {
                                  icon: Copy,
                                  label: "Duplicate",
                                  onClick: async () => {
                                    const r = await run("dup", duplicateCampaignAction(c.id), "Campaign duplicated");
                                    if (r) router.push(`/email/campaigns/${r.id}`);
                                  },
                                },
                                {
                                  icon: Trash2,
                                  label: "Delete",
                                  danger: true,
                                  onClick: () =>
                                    confirm({
                                      title: `Delete “${c.name}”?`,
                                      body: deleteCampaignWarning(c),
                                      confirmLabel: "Delete campaign",
                                      danger: true,
                                      run: () => run("del", deleteCampaignAction(c.id), "Campaign deleted"),
                                    }),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      {dialog}
      <RenameModal
        open={!!renaming}
        title="Rename campaign"
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSave={(name) => run("rename", renameCampaignAction(renaming!.id, name), "Campaign renamed")}
      />
    </div>
  );
}

export function deleteCampaignWarning(c: CampaignView) {
  if (c.status === "SENDING" || c.status === "PAUSED")
    return "It's still going out — deleting stops it straight away. Its report and open/click history are deleted too. Contacts aren't affected.";
  if (c.stats.sent) return "Its report and open/click history are deleted too. Contacts aren't affected.";
  return undefined;
}
