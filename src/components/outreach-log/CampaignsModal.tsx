"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { LogCampaign } from "@prisma/client";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { cn } from "@/lib/utils";
import { deleteLogCampaign, saveLogCampaign } from "@/server/outreach-log/actions";
import { useLogAction } from "./shared";

const COLORS = ["#EA8B5E", "#22C55E", "#3B82F6", "#A855F7", "#EF4444", "#F59E0B", "#14B8A6", "#64748B"];
const IDEAS = ["Free website offer", "SEO retainer", "Website redesign", "Google Ads audit"];

/** Create, rename, recolour, pause or delete campaign pools. */
export function CampaignsModal({ campaigns, counts, onClose }: { campaigns: LogCampaign[]; counts: Record<string, number>; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const blank = { id: undefined as string | undefined, name: "", color: COLORS[0], description: "", active: true };
  const [f, setF] = useState(blank);
  const editing = !!f.id;

  const save = async () => {
    if (await run(() => saveLogCampaign(f), editing ? "Campaign saved" : `Created “${f.name.trim()}”`)) setF({ ...blank, color: COLORS[(campaigns.length + 1) % COLORS.length] });
  };

  return (
    <Modal open onClose={onClose} title="Campaigns" subtitle="Each campaign is its own pool, so different offers never mix. Its contacts, stats and follow-ups are shown separately." className="max-w-[640px]">
      <div className="space-y-2">
        {campaigns.length === 0 && <p className="rounded-2xl bg-page px-5 py-4 text-[13.5px] text-neutral-500">No campaigns yet. Create one below, e.g. “Free website offer”.</p>}
        {campaigns.map((c) => (
          <div key={c.id} className={cn("flex items-center gap-4 rounded-2xl px-4 py-3", f.id === c.id ? "bg-page" : "hover:bg-page/60")}>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.color }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium">
                {c.name}
                {!c.active && <span className="ml-2 text-[12px] font-normal text-neutral-400">paused</span>}
              </p>
              {c.description && <p className="mt-0.5 truncate text-[12.5px] text-neutral-500">{c.description}</p>}
            </div>
            <span className="text-[13px] tabular-nums text-neutral-500">{counts[c.id] ?? 0}</span>
            <Button size="sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setF({ id: c.id, name: c.name, color: c.color, description: c.description, active: c.active })}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${c.name}`}
              disabled={pending}
              onClick={async () => confirm(`Delete “${c.name}”? Its ${counts[c.id] ?? 0} contacts stay, just without a campaign.`) && run(() => deleteLogCampaign(c.id), "Campaign deleted")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-[20px] border border-black/[0.06] p-5">
        <p className="mb-4 text-[14px] font-medium">{editing ? "Edit campaign" : "New campaign"}</p>
        <div className="grid gap-5">
          <Field label="Name" required>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Free website offer" />
          </Field>
          {!editing && (
            <div className="-mt-2 flex flex-wrap gap-2">
              {IDEAS.filter((i) => !campaigns.some((c) => c.name.toLowerCase() === i.toLowerCase())).map((i) => (
                <button key={i} type="button" onClick={() => setF({ ...f, name: i })} className="rounded-full bg-page px-3 py-1.5 text-[12.5px] text-neutral-600 hover:bg-neutral-200/80">
                  {i}
                </button>
              ))}
            </div>
          )}
          <Field label="What it is" hint="Shown above the list, e.g. the offer and who it's for.">
            <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] text-neutral-600">Colour</span>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setF({ ...f, color: c })}
                className={cn("h-7 w-7 rounded-full ring-offset-2", f.color === c && "ring-2 ring-ink")}
                style={{ background: c }}
              />
            ))}
          </div>
          {editing && (
            <label className="flex items-center gap-3 text-[14px]">
              <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4" />
              Active (shown as a tab and when logging)
            </label>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          {editing && <Button variant="secondary" onClick={() => setF(blank)}>Cancel</Button>}
          <Button disabled={pending || !f.name.trim()} onClick={save}>
            {!editing && <Plus className="h-4 w-4" />}
            {editing ? "Save" : "Create campaign"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
