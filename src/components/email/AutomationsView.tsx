"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Mail, Plus, Workflow, Zap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buttonClass } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Form";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { STAGE_LABELS, type PipelineStage } from "@/lib/constants";
import { pct, TRIGGER_LABELS, WAIT_MS, type AutomationStep } from "@/lib/email";
import type { AutomationView } from "@/lib/email-types";
import { setAutomationStatusAction } from "@/server/email/actions";
import { TintPill, useEmailAction } from "./kit";

export function triggerText(a: Pick<AutomationView, "trigger" | "triggerValue">) {
  if (a.trigger === "STAGE_CHANGED") return `Lead moves to ${STAGE_LABELS[a.triggerValue as PipelineStage] ?? a.triggerValue}`;
  if (a.trigger === "TAG_ADDED") return `Tagged “${a.triggerValue}”`;
  return TRIGGER_LABELS[a.trigger];
}

export function sequenceSummary(steps: AutomationStep[]) {
  const emails = steps.filter((s) => s.type === "email").length;
  const ms = steps.reduce((t, s) => (s.type === "wait" ? t + s.amount * WAIT_MS[s.unit] : t), 0);
  const days = Math.round(ms / 86_400_000);
  return `${emails} email${emails === 1 ? "" : "s"}${days ? ` over ${days} day${days === 1 ? "" : "s"}` : ""}`;
}

export function AutomationsView({ automations }: { automations: AutomationView[] }) {
  const router = useRouter();
  const { run, busy } = useEmailAction();

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Follow-up sequences that send themselves — and stop the moment someone replies."
        actions={
          <Link href="/email/automations/new" className={buttonClass("primary", "lg")}>
            <Plus className="h-4 w-4" /> New automation
          </Link>
        }
      />

      {automations.length === 0 ? (
        <Card>
          <EmptyState
            icon={Workflow}
            title="Build your first follow-up sequence"
            body="For example: when a lead is tagged “Cold outreach”, send an intro email, wait 3 days, send a follow-up, wait 4 days, send a break-up email."
            action={
              <Link href="/email/automations/new" className={buttonClass("primary", "md")}>
                <Plus className="h-4 w-4" /> New automation
              </Link>
            }
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
                    <Workflow className="h-5 w-5" strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{a.name}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-neutral-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" /> {triggerText(a)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> {sequenceSummary(a.steps)}
                      </span>
                    </p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    {a.status === "DRAFT" ? (
                      <TintPill color="#A3A3A3">Draft</TintPill>
                    ) : (
                      <Toggle
                        checked={active}
                        disabled={busy === a.id}
                        onChange={(on) => run(a.id, setAutomationStatusAction(a.id, on ? "ACTIVE" : "PAUSED"), on ? "Automation is live" : "Automation paused")}
                        label={<span className="text-[12.5px] text-neutral-500">{active ? "Live" : "Paused"}</span>}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl bg-soft p-5 sm:grid-cols-4">
                  <Metric label="In progress" value={a.counts.active} />
                  <Metric label="Finished" value={a.counts.completed + a.counts.stopped} />
                  <Metric label="Open rate" value={a.stats.sent ? `${pct(a.stats.opened, a.stats.sent)}%` : "—"} />
                  <Metric label="Reply rate" value={a.stats.sent ? `${pct(a.stats.replied, a.stats.sent)}%` : "—"} />
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-neutral-500">
                  <Clock className="h-3.5 w-3.5" /> {a.stats.sent.toLocaleString("en-US")} emails sent{a.stopOnReply ? " · stops on reply" : ""}
                </p>
              </Card>
            );
          })}
        </div>
      )}
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
