"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Edit2, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { upsertCampaign, deleteCampaign, setCampaignStatus } from "@/server/linkedin/actions";
import type { LiAccount, LiCampaign, LiCampaignStatus } from "@prisma/client";

type CampaignWithCount = LiCampaign & { _count: { prospects: number } };

const STATUS_COLOR: Record<LiCampaignStatus, string> = {
  DRAFT: "bg-neutral-100 text-neutral-600",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
};

type Step = { type: "connect" | "message" | "follow_up" | "wait"; waitDays?: number; templateId?: string; note?: string };

const DEFAULT_STEPS: Step[] = [
  { type: "connect", note: "Send connection request" },
  { type: "wait", waitDays: 2 },
  { type: "message", note: "Initial message after connecting" },
  { type: "wait", waitDays: 4 },
  { type: "follow_up", note: "Follow-up if no reply" },
];

export function CampaignsView({
  campaigns: initial,
  accounts,
}: {
  campaigns: CampaignWithCount[];
  accounts: LiAccount[];
}) {
  const [campaigns, setCampaigns] = useState(initial);
  const [editing, setEditing] = useState<CampaignWithCount | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = (data: { id?: string; name: string; status: LiCampaignStatus; steps: Step[]; senderAccountIds: string[]; startDate?: Date | null }) => {
    startTransition(async () => {
      await upsertCampaign(data);
      window.location.reload();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this campaign? All prospect progress will be lost.")) return;
    startTransition(async () => {
      await deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    });
  };

  const handleStatus = (id: string, status: LiCampaignStatus) => {
    startTransition(async () => {
      await setCampaignStatus(id, status);
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    });
  };

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Outreach sequences sent across your LinkedIn accounts"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            New campaign
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 py-20 text-center">
          <Send className="mx-auto h-10 w-10 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-4 text-[15px] text-neutral-500">No campaigns yet</p>
          <p className="mt-1 text-[13px] text-neutral-400">Create a sequence of connect → message → follow-up steps</p>
          <Button className="mt-6" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New campaign</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[15px] font-semibold">{c.name}</p>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", STATUS_COLOR[c.status])}>
                    {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                  {(c.steps as Step[]).length} steps · {c._count.prospects} prospects
                  {c.startDate && ` · Started ${new Date(c.startDate).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "ACTIVE" && (
                  <button onClick={() => handleStatus(c.id, "PAUSED")} className="flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px] hover:bg-neutral-50">
                    <Pause className="h-3.5 w-3.5" strokeWidth={1.8} />Pause
                  </button>
                )}
                {(c.status === "DRAFT" || c.status === "PAUSED") && (
                  <button onClick={() => handleStatus(c.id, "ACTIVE")} className="flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12.5px] text-emerald-700 hover:bg-emerald-100">
                    <Play className="h-3.5 w-3.5" strokeWidth={1.8} />Start
                  </button>
                )}
                <button onClick={() => setEditing(c)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-page" title="Edit">
                  <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <button onClick={() => handleDelete(c.id)} className="grid h-8 w-8 place-items-center rounded-full text-rose-400 hover:bg-rose-50" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
                <Link href={`/linkedin/campaigns/${c.id}`} className="grid h-8 w-8 place-items-center rounded-full hover:bg-page">
                  <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <CampaignModal
          campaign={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={pending}
        />
      )}
    </div>
  );
}

function CampaignModal({
  campaign,
  accounts,
  onClose,
  onSave,
  saving,
}: {
  campaign: CampaignWithCount | null;
  accounts: LiAccount[];
  onClose: () => void;
  onSave: (data: { id?: string; name: string; status: LiCampaignStatus; steps: Step[]; senderAccountIds: string[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [status, setStatus] = useState<LiCampaignStatus>(campaign?.status ?? "DRAFT");
  const [steps, setSteps] = useState<Step[]>((campaign?.steps as Step[]) ?? DEFAULT_STEPS);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>((campaign?.senderAccountIds as string[]) ?? []);

  const toggleAccount = (id: string) =>
    setSelectedAccounts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addStep = (type: Step["type"]) => setSteps((s) => [...s, type === "wait" ? { type, waitDays: 3 } : { type, note: "" }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((step, idx) => (idx === i ? { ...step, ...patch } : step)));

  const STEP_LABELS: Record<Step["type"], string> = { connect: "Connect request", message: "Send message", follow_up: "Follow-up message", wait: "Wait" };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-[24px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-[18px] font-semibold">{campaign ? "Edit campaign" : "New campaign"}</h2>
        <div className="max-h-[70vh] overflow-y-auto space-y-5 pr-1">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Campaign name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Agency Outreach Q1" className="w-full rounded-xl border border-black/[0.08] bg-page px-3.5 py-2.5 text-[14px] outline-none focus:border-ink" />
          </label>

          {/* Sender accounts */}
          <div>
            <p className="mb-2 text-[13px] font-medium">Sender accounts</p>
            {accounts.length === 0 ? (
              <p className="text-[13px] text-neutral-400 italic">Add LinkedIn accounts first</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={cn("rounded-full border px-3 py-1.5 text-[12.5px] transition-colors", selectedAccounts.includes(a.id) ? "border-ink bg-ink text-white" : "border-black/[0.08] bg-page text-ink hover:bg-neutral-100")}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Steps */}
          <div>
            <p className="mb-3 text-[13px] font-medium">Sequence steps</p>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-black/[0.06] bg-page px-3.5 py-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[10px] font-bold text-white">{i + 1}</span>
                  <span className="w-32 shrink-0 text-[13px] font-medium text-neutral-600">{STEP_LABELS[step.type]}</span>
                  {step.type === "wait" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-neutral-500">Wait</span>
                      <input type="number" min={1} max={30} value={step.waitDays ?? 3} onChange={(e) => updateStep(i, { waitDays: Number(e.target.value) })} className="w-14 rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-[13px] text-center outline-none" />
                      <span className="text-[13px] text-neutral-500">days</span>
                    </div>
                  ) : (
                    <input value={step.note ?? ""} onChange={(e) => updateStep(i, { note: e.target.value })} placeholder="Note or instruction…" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" />
                  )}
                  <button onClick={() => removeStep(i)} className="ml-auto shrink-0 text-neutral-400 hover:text-rose-500">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["connect", "message", "follow_up", "wait"] as Step["type"][]).map((t) => (
                <button key={t} onClick={() => addStep(t)} className="rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12.5px] hover:bg-page">
                  + {STEP_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...(campaign ? { id: campaign.id } : {}), name, status, steps, senderAccountIds: selectedAccounts })} disabled={!name || saving}>
            {saving ? "Saving…" : "Save campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
