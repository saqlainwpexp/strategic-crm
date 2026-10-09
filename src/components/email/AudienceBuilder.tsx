"use client";

import { useEffect, useState } from "react";
import { Users, X } from "lucide-react";
import { Input } from "@/components/ui/Form";
import { AGENCY_SERVICES, PIPELINE_STAGES, STAGE_LABELS, TEMP_LABELS, type PipelineStage, type Temperature } from "@/lib/constants";
import type { AudienceFilter } from "@/lib/email";
import type { AudienceOptions } from "@/lib/email-types";
import { previewAudienceAction } from "@/server/email/actions";
import { MultiPick } from "./MultiPick";

/** Filter-based audience picker with a live count of who'll receive the email. */
export function AudienceBuilder({
  value,
  onChange,
  options,
  onCount,
}: {
  value: AudienceFilter;
  onChange: (v: AudienceFilter) => void;
  options: AudienceOptions;
  onCount?: (n: number | null) => void;
}) {
  const [preview, setPreview] = useState<{ count: number; sample: { businessName: string; email: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const set = <K extends keyof AudienceFilter>(k: K, v: AudienceFilter[K]) => onChange({ ...value, [k]: v });
  const key = JSON.stringify(value);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await previewAudienceAction(JSON.parse(key) as AudienceFilter).catch(() => null);
      if (!live) return;
      setLoading(false);
      if (res?.ok) {
        setPreview(res.data);
        onCount?.(res.data.count);
      } else onCount?.(null);
    }, 450);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const picked = value.leadIds.length > 0;

  return (
    <div>
      {picked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-soft px-5 py-4">
          <Users className="h-4 w-4" />
          <span className="text-[14px]">{value.leadIds.length.toLocaleString("en-US")} contacts picked from the Contacts page</span>
          <button onClick={() => set("leadIds", [])} className="ml-auto flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-ink">
            <X className="h-3.5 w-3.5" /> Use filters instead
          </button>
        </div>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-neutral-500">
            Everyone with an email who hasn't unsubscribed or bounced. Narrow it down with filters — leave them empty to include all.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <MultiPick label="Tags" options={options.tags.map((t) => ({ value: t, label: t }))} value={value.tags} onChange={(v) => set("tags", v)} />
            <MultiPick
              label="Pipeline stage"
              options={PIPELINE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
              value={value.stages}
              onChange={(v) => set("stages", v as PipelineStage[])}
            />
            <MultiPick
              label="Temperature"
              options={(["HOT", "WARM", "COLD"] as Temperature[]).map((t) => ({ value: t, label: TEMP_LABELS[t] }))}
              value={value.temperatures}
              onChange={(v) => set("temperatures", v as Temperature[])}
            />
            <MultiPick label="Service" options={AGENCY_SERVICES.map((s) => ({ value: s, label: s }))} value={value.services} onChange={(v) => set("services", v)} />
            <MultiPick label="City" options={options.cities.map((c) => ({ value: c, label: c }))} value={value.cities} onChange={(v) => set("cities", v)} />
            <MultiPick label="Source" options={options.sources.map((s) => ({ value: s, label: s }))} value={value.sources} onChange={(v) => set("sources", v)} />
            {options.pools.length > 0 && (
              <MultiPick label="Lead pool" options={options.pools.map((p) => ({ value: p.id, label: p.name }))} value={value.poolIds} onChange={(v) => set("poolIds", v)} />
            )}
            <MultiPick label="Assigned rep" options={options.reps.map((r) => ({ value: r.id, label: r.name }))} value={value.assignedToIds} onChange={(v) => set("assignedToIds", v)} />
          </div>
          <label className="mt-5 flex flex-wrap items-center gap-3 text-[13px] text-neutral-600">
            Skip anyone emailed in the last
            <Input
              type="number"
              min={0}
              max={365}
              value={value.excludeEmailedWithinDays}
              onChange={(e) => set("excludeEmailedWithinDays", Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
              className="h-10 w-[84px] text-center"
            />
            days <span className="text-neutral-400">(0 = don't skip)</span>
          </label>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-start gap-6 rounded-2xl border border-neutral-100 p-5">
        <div>
          <p className="text-[12px] text-neutral-500">Will receive this email</p>
          <p className="mt-1.5 text-[30px] leading-none tracking-[-0.02em] tabular-nums">
            {loading && !preview ? "…" : (preview?.count ?? 0).toLocaleString("en-US")}
          </p>
        </div>
        {preview && preview.sample.length > 0 && (
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-neutral-500">For example</p>
            <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {preview.sample.map((s) => (
                <li key={s.email} className="min-w-0 truncate text-[13px]">
                  {s.businessName} <span className="text-neutral-400">· {s.email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
