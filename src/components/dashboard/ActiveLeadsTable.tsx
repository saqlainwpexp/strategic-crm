"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { ScoreTag, StageLabel } from "@/components/ui/Badges";
import { UserChip } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/ui/Form";
import { OPEN_STAGES } from "@/lib/constants";
import { dayKey, dayLabel, formatTime } from "@/lib/date";
import { compactMoney, groupBy } from "@/lib/utils";
import { currency } from "@/lib/currency";

export function ActiveLeadsTable() {
  const { data, perms, userById, tempOf } = useCrm();
  const router = useRouter();
  const [q, setQ] = useState("");

  const callCounts = useMemo(() => {
    const g = groupBy(data.calls, (c) => c.leadId);
    return new Map(Object.entries(g).map(([k, v]) => [k, v.length]));
  }, [data.calls]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.leads
      .filter((l) => OPEN_STAGES.includes(l.stage))
      .filter((l) => !t || l.businessName.toLowerCase().includes(t) || l.city.toLowerCase().includes(t))
      .sort((a, b) => b.leadScore - a.leadScore)
      .slice(0, 12);
  }, [data.leads, q]);

  return (
    <section className="card flex h-full min-h-[440px] min-w-0 flex-col p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Active leads</h2>
        <div className="flex items-center gap-2">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search here"
            className="w-[170px] md:w-[240px]"
          />
          <Link
            href="/leads"
            aria-label="All leads and filters"
            title="All leads and filters"
            className="grid h-10 w-10 place-items-center rounded-full bg-page text-ink hover:bg-neutral-200"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={1.6} />
          </Link>
        </div>
      </div>

      <div className="relative mt-5 min-h-[260px] flex-1">
        <div className="scroll-slim absolute inset-0 overflow-auto">
          <table className="w-full min-w-[720px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[13%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[15%]" />
              <col className="w-[11%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-left text-[12.5px] text-neutral-700">
                {["Business", "Service", "Calls", "Value", perms.seesTeam ? "Rep" : "Follow-up", "Score", "Status"].map((h) => (
                  <th key={h} className="border-b border-neutral-200 pb-3.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {rows.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => router.push(`/leads?lead=${lead.id}`)}
                  className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/80"
                >
                  <td className="py-4 pr-3">
                    <div className="flex items-center gap-3">
                      <LeadThumb lead={lead} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{lead.businessName}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">{lead.address}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 text-ink">{lead.service}</td>
                  <td className="py-4 tabular-nums text-ink">{callCounts.get(lead.id) ?? 0}</td>
                  <td className="py-4 text-ink">
                    <span className="text-neutral-400">{currency().symbol} </span>
                    {compactMoney(lead.estimatedValue, false)}
                  </td>
                  <td className="py-4 pr-2">
                    {perms.seesTeam ? (
                      userById(lead.assignedToId) ? (
                        <UserChip name={userById(lead.assignedToId)!.name} />
                      ) : (
                        <span className="text-neutral-400">Unassigned</span>
                      )
                    ) : lead.nextFollowUpAt ? (
                      <span className="text-ink">
                        {dayLabel(dayKey(lead.nextFollowUpAt))}
                        <span className="block text-[11.5px] text-neutral-500">{formatTime(lead.nextFollowUpAt)}</span>
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-4">
                    <ScoreTag score={lead.leadScore} temp={tempOf(lead.leadScore)} />
                  </td>
                  <td className="py-4">
                    <StageLabel stage={lead.stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
