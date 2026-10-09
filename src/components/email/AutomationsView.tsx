"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, GitBranch, Mail, MessageSquareReply, Pencil, PhoneForwarded, Plus, Trash2, Workflow, Zap, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { STAGE_LABELS, type PipelineStage } from "@/lib/constants";
import { pct, TRIGGER_LABELS } from "@/lib/email";
import { flowSummary } from "@/lib/automation-flow";
import type { AutomationView } from "@/lib/email-types";
import { deleteAutomationAction, duplicateAutomationAction, renameAutomationAction, setAutomationStatusAction } from "@/server/email/actions";
import { RenameModal, RowMenu } from "@/components/ui/RowMenu";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { TintPill, useEmailAction } from "./kit";

export function triggerText(a: Pick<AutomationView, "trigger" | "triggerValue">) {
  if (a.trigger === "STAGE_CHANGED") return `Lead moves to ${STAGE_LABELS[a.triggerValue as PipelineStage] ?? a.triggerValue}`;
  if (a.trigger === "TAG_ADDED") return `Tagged “${a.triggerValue}”`;
  return TRIGGER_LABELS[a.trigger];
}

const STARTERS: { key: string; icon: LucideIcon; title: string; body: string }[] = [
  { key: "outreach", icon: GitBranch, title: "Cold outreach sequence", body: "Intro email → wait 3 days → opened? follow-up : different angle → wait → break-up email." },
  { key: "replied", icon: PhoneForwarded, title: "Replies → sales calls", body: "When someone replies, mark them Interested, give them to a rep and put them in the call queue." },
  { key: "blank", icon: Workflow, title: "Blank workflow", body: "Start with just a trigger and build your own." },
];

export function AutomationsView({ automations }: { automations: AutomationView[] }) {
  const router = useRouter();
  const { run, busy } = useEmailAction();
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<AutomationView | null>(null);
  const { confirm, dialog } = useConfirm();

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Visual workflows that send, wait, branch on opens and replies, and hand hot leads to your callers."
        actions={
          <Button size="lg" onClick={() => setPicking(true)}>
            <Plus className="h-4 w-4" /> New workflow
          </Button>
        }
      />

      {automations.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="Build your outreach engine"
            body="Pair a cold outreach sequence (for your ListKit leads) with a “Replies → sales calls” workflow, and interested prospects land in your reps' call queue automatically."
            action={<Button onClick={() => setPicking(true)}>Choose a starting point</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {automations.map((a) => {
            const active = a.status === "ACTIVE";
            return (
              <Card key={a.id} className="flex cursor-pointer flex-col transition-shadow hover:shadow-[0_0_0_1px_rgba(10,10,10,0.08)]" onClick={() => router.push(`/email/automations/${a.id}`)}>
                <div className="flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-page">
                    {a.trigger === "EMAIL_REPLIED" ? <MessageSquareReply className="h-5 w-5" strokeWidth={1.7} /> : <Workflow className="h-5 w-5" strokeWidth={1.7} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{a.name}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" /> {triggerText(a)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> {flowSummary(a.flow)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {a.status === "DRAFT" ? (
                      <TintPill color="#A3A3A3">Draft</TintPill>
                    ) : (
                      <Toggle
                        checked={active}
                        disabled={busy === a.id}
                        onChange={(on) => run(a.id, setAutomationStatusAction(a.id, on ? "ACTIVE" : "PAUSED"), on ? "Workflow is live" : "Workflow paused")}
                        label={<span className="text-[12.5px] text-neutral-500">{active ? "Live" : "Paused"}</span>}
                      />
                    )}
                    <RowMenu
                      items={[
                        { icon: Pencil, label: "Rename", onClick: () => setRenaming(a) },
                        {
                          icon: Copy,
                          label: "Duplicate",
                          onClick: async () => {
                            const r = await run("dup", duplicateAutomationAction(a.id), "Workflow duplicated");
                            if (r) router.push(`/email/automations/${r.id}`);
                          },
                        },
                        {
                          icon: Trash2,
                          label: "Delete",
                          danger: true,
                          onClick: () =>
                            confirm({
                              title: `Delete “${a.name}”?`,
                              body: a.counts.active
                                ? `${a.counts.active} contact${a.counts.active === 1 ? " is" : "s are"} still in it and will stop receiving its emails. Its stats are deleted too.`
                                : "Its stats are deleted too. Contacts aren't affected.",
                              confirmLabel: "Delete workflow",
                              danger: true,
                              run: () => run("del", deleteAutomationAction(a.id), "Workflow deleted"),
                            }),
                        },
                      ]}
                    />
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-soft p-5 sm:grid-cols-4">
                  <Metric label="In progress" value={a.counts.active} />
                  <Metric label="Finished" value={a.counts.completed + a.counts.stopped} />
                  <Metric label="Open rate" value={a.stats.sent ? `${pct(a.stats.opened, a.stats.sent)}%` : "—"} />
                  <Metric label="Reply rate" value={a.stats.sent ? `${pct(a.stats.replied, a.stats.sent)}%` : "—"} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {dialog}
      <RenameModal
        open={!!renaming}
        title="Rename workflow"
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSave={(name) => run("rename", renameAutomationAction(renaming!.id, name), "Workflow renamed")}
      />
      <Modal open={picking} onClose={() => setPicking(false)} title="New workflow" subtitle="Pick a starting point — you can change every step on the canvas." className="max-w-[640px]">
        <div className="flex flex-col gap-3">
          {STARTERS.map((s) => (
            <button key={s.key} onClick={() => router.push(`/email/automations/new?start=${s.key}`)} className="flex items-start gap-4 rounded-2xl bg-soft p-5 text-left transition-colors hover:bg-page">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white">
                <s.icon className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[15px] font-medium">{s.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-neutral-500">{s.body}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">{label}</p>
      <p className="mt-2 text-[20px] tabular-nums tracking-[-0.01em]">{value}</p>
    </div>
  );
}
