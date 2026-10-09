"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronDown, Clock, Hourglass, Mail, Pause, Play, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { StatusDot } from "@/components/ui/Badges";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { formatDateTime, relativeTime } from "@/lib/date";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { TRIGGER_LABELS, type AutomationStep, type AutomationTrigger, type WaitUnit } from "@/lib/email";
import { STARTER_TEMPLATES } from "@/lib/email-starters";
import type { AutomationView, EmailAccountView, EnrollmentView, TemplateView } from "@/lib/email-types";
import {
  deleteAutomationAction,
  enrollContactsAction,
  saveAutomationAction,
  searchContactsAction,
  setAutomationStatusAction,
  stopEnrollmentAction,
} from "@/server/email/actions";
import { EmailEditor } from "./EmailEditor";
import { SendTestButton } from "./SendTestButton";
import { ACCOUNT_STATUS, TintPill, useEmailAction } from "./kit";
import { sequenceSummary } from "./AutomationsView";

const sid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_STEPS = (): AutomationStep[] => [
  { id: sid(), type: "email", subject: STARTER_TEMPLATES[0].subject, html: STARTER_TEMPLATES[0].html },
  { id: sid(), type: "wait", amount: 3, unit: "days" },
  { id: sid(), type: "email", subject: STARTER_TEMPLATES[3].subject, html: STARTER_TEMPLATES[3].html },
  { id: sid(), type: "wait", amount: 4, unit: "days" },
  { id: sid(), type: "email", subject: STARTER_TEMPLATES[4].subject, html: STARTER_TEMPLATES[4].html },
];

type Form = { name: string; trigger: AutomationTrigger; triggerValue: string; steps: AutomationStep[]; accountIds: string[]; stopOnReply: boolean };

export function AutomationEditor({
  automation,
  enrollments,
  accounts,
  templates,
  tags,
}: {
  automation: AutomationView | null;
  enrollments: EnrollmentView[];
  accounts: EmailAccountView[];
  templates: TemplateView[];
  tags: string[];
}) {
  const router = useRouter();
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [f, setF] = useState<Form>(() =>
    automation
      ? { name: automation.name, trigger: automation.trigger, triggerValue: automation.triggerValue, steps: automation.steps, accountIds: automation.accountIds, stopOnReply: automation.stopOnReply }
      : { name: "Cold outreach sequence", trigger: "MANUAL", triggerValue: "", steps: DEFAULT_STEPS(), accountIds: accounts.filter((a) => a.status === "CONNECTED").map((a) => a.id), stopOnReply: true }
  );
  const [openStep, setOpenStep] = useState<string | null>(f.steps.find((s) => s.type === "email")?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };
  const setStep = (id: string, patch: Partial<AutomationStep>) =>
    set("steps", f.steps.map((s) => (s.id === id ? ({ ...s, ...patch } as AutomationStep) : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...f.steps];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    set("steps", next);
  };
  const add = (type: "email" | "wait", at: number) => {
    const step: AutomationStep = type === "email" ? { id: sid(), type, subject: "", html: "" } : { id: sid(), type, amount: 2, unit: "days" };
    const next = [...f.steps];
    next.splice(at, 0, step);
    set("steps", next);
    if (type === "email") setOpenStep(step.id);
  };

  async function save(): Promise<string | null> {
    const res = await run("save", saveAutomationAction({ id: automation?.id, ...f }), automation ? "Automation saved" : undefined);
    if (!res) return null;
    setDirty(false);
    if (!automation) router.replace(`/email/automations/${res.id}`);
    return res.id;
  }

  const status = automation?.status ?? "DRAFT";
  const live = status === "ACTIVE";
  let emailNo = 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-6">
        <div className="min-w-0 flex-1">
          <Link href="/email/automations" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Automations
          </Link>
          <input
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            aria-label="Automation name"
            className="w-full bg-transparent text-[34px] font-normal leading-[1.1] tracking-[-0.025em] outline-none md:text-[40px]"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px] text-neutral-500">
            <TintPill color={live ? "#1F9D4C" : status === "PAUSED" ? "#D97706" : "#A3A3A3"}>{live ? "Live" : status === "PAUSED" ? "Paused" : "Draft"}</TintPill>
            {sequenceSummary(f.steps)}
            {dirty && " · unsaved changes"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {automation && (
            <IconButton
              label="Delete automation"
              size="lg"
              variant="white"
              onClick={() =>
                confirm({
                  title: `Delete “${automation.name}”?`,
                  body: "Everyone in it stops receiving its emails. Sent-email stats are deleted too.",
                  confirmLabel: "Delete",
                  danger: true,
                  run: async () => {
                    if (await run("del", deleteAutomationAction(automation.id), "Automation deleted")) router.push("/email/automations");
                  },
                })
              }
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
          <Button variant="secondary" size="lg" onClick={save} disabled={busy === "save" || !f.name.trim()}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          {live ? (
            <Button size="lg" variant="secondary" disabled={busy === "status"} onClick={() => run("status", setAutomationStatusAction(automation!.id, "PAUSED"), "Automation paused")}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={busy === "status" || busy === "save"}
              onClick={async () => {
                const id = dirty || !automation ? await save() : automation.id;
                if (id) await run("status", setAutomationStatusAction(id, "ACTIVE"), "Automation is live");
              }}
            >
              <Play className="h-4 w-4" /> {status === "PAUSED" ? "Resume" : "Turn on"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-8">
            <CardHeader title="When does someone start?" />
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Trigger">
                <Select value={f.trigger} onChange={(e) => setF((p) => ({ ...p, trigger: e.target.value as AutomationTrigger, triggerValue: "" }))}>
                  {(Object.keys(TRIGGER_LABELS) as AutomationTrigger[]).map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              {f.trigger === "STAGE_CHANGED" && (
                <Field label="Stage">
                  <Select value={f.triggerValue} onChange={(e) => set("triggerValue", e.target.value)}>
                    <option value="">Choose a stage…</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {f.trigger === "TAG_ADDED" && (
                <Field label="Tag">
                  <Input list="automation-tags" value={f.triggerValue} placeholder="e.g. Cold outreach" onChange={(e) => set("triggerValue", e.target.value)} />
                  <datalist id="automation-tags">
                    {tags.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </Field>
              )}
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-neutral-500">
              {f.trigger === "MANUAL"
                ? "Add people yourself — from the Contacts page (select → Add to automation) or with “Add contacts” on the right."
                : f.trigger === "LEAD_CREATED"
                  ? "Everyone added to the CRM with an email address — by hand or by CSV import — starts this sequence."
                  : f.trigger === "STAGE_CHANGED"
                    ? "Fires when a lead moves into that stage — from the pipeline board, a call outcome or a meeting update."
                    : "Fires when that tag is added to a contact on the Contacts page."}
            </p>
          </Card>

          <Card className="p-8">
            <CardHeader title="Sequence" subtitle="Steps run top to bottom. Emails use the contact's details, just like campaigns." />
            <ol className="flex flex-col">
              {f.steps.map((s, i) => {
                const n = s.type === "email" ? ++emailNo : 0;
                const expanded = openStep === s.id;
                return (
                  <li key={s.id} className="relative">
                    <AddBetween onAdd={(t) => add(t, i)} />
                    <div className={cn("rounded-2xl border transition", expanded ? "border-ink/20" : "border-black/[0.08]")}>
                      <div className="flex items-center gap-3.5 px-5 py-4">
                        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[13px]", s.type === "email" ? "bg-ink text-white" : "bg-page text-ink")}>
                          {s.type === "email" ? <Mail className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
                        </span>
                        {s.type === "email" ? (
                          <button className="min-w-0 flex-1 text-left" onClick={() => setOpenStep(expanded ? null : s.id)}>
                            <p className="text-[12px] text-neutral-500">Email {n}</p>
                            <p className="truncate text-[14.5px] font-medium">{s.subject || "No subject yet"}</p>
                          </button>
                        ) : (
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 text-[14px]">
                            Wait
                            <Input type="number" min={1} max={365} value={s.amount} onChange={(e) => setStep(s.id, { amount: Math.max(1, Number(e.target.value) || 1) })} className="h-10 w-[78px] text-center" />
                            <Select value={s.unit} onChange={(e) => setStep(s.id, { unit: e.target.value as WaitUnit })} className="w-[130px]">
                              <option value="minutes">minutes</option>
                              <option value="hours">hours</option>
                              <option value="days">days</option>
                            </Select>
                          </div>
                        )}
                        <div className="flex shrink-0 items-center gap-1">
                          <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Move down" size="sm" disabled={i === f.steps.length - 1} onClick={() => move(i, 1)}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Remove step" size="sm" onClick={() => set("steps", f.steps.filter((x) => x.id !== s.id))}>
                            <X className="h-3.5 w-3.5" />
                          </IconButton>
                          {s.type === "email" && (
                            <IconButton label={expanded ? "Collapse" : "Edit email"} size="sm" onClick={() => setOpenStep(expanded ? null : s.id)}>
                              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                            </IconButton>
                          )}
                        </div>
                      </div>
                      {s.type === "email" && expanded && (
                        <div className="border-t border-neutral-100 px-5 pb-5 pt-5">
                          <div className="flex flex-col gap-4 md:flex-row md:items-end">
                            <Field label="Subject" className="flex-1">
                              <Input value={s.subject} onChange={(e) => setStep(s.id, { subject: e.target.value })} placeholder="Re: {{business_name}}" />
                            </Field>
                            {templates.length > 0 && (
                              <Select
                                value=""
                                className="md:w-[220px]"
                                onChange={(e) => {
                                  const t = templates.find((x) => x.id === e.target.value);
                                  if (t) setStep(s.id, { subject: t.subject || s.subject, html: t.html });
                                }}
                              >
                                <option value="">Load a template…</option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </div>
                          <div className="mt-4">
                            <EmailEditor value={s.html} onChange={(html) => setStep(s.id, { html })} minHeight={220} />
                          </div>
                          <div className="mt-4 flex justify-end">
                            <SendTestButton accounts={accounts.filter((a) => a.status !== "DISCONNECTED")} subject={s.subject} html={s.html} defaultAccountId={f.accountIds[0]} />
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
              <li>
                <AddBetween onAdd={(t) => add(t, f.steps.length)} last />
              </li>
            </ol>
          </Card>

          <Card className="p-8">
            <CardHeader title="Sending" />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {accounts.map((a) => {
                const on = f.accountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => set("accountIds", on ? f.accountIds.filter((x) => x !== a.id) : [...f.accountIds, a.id])}
                    className={cn("flex items-center gap-3.5 rounded-2xl border p-4 text-left transition", on ? "border-ink shadow-[0_0_0_1px_rgb(var(--ink))]" : "border-black/[0.08] hover:border-black/20")}
                  >
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-white" : "border-neutral-300")}>
                      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{a.email}</span>
                      <span className="text-[12px] text-neutral-500">{ACCOUNT_STATUS[a.status].label}</span>
                    </span>
                  </button>
                );
              })}
              {accounts.length === 0 && (
                <p className="text-[13.5px] text-neutral-500">
                  <Link href="/email/sending?new=1" className="underline underline-offset-4">
                    Connect a mailbox
                  </Link>{" "}
                  to send from.
                </p>
              )}
            </div>
            <div className="mt-6">
              <Toggle checked={f.stopOnReply} onChange={(v) => set("stopOnReply", v)} label="Stop the sequence when the contact replies" />
            </div>
          </Card>
        </div>

        <div>
          <Card className="sticky top-[112px] p-0">
            <div className="flex items-center justify-between gap-3 px-7 pb-5 pt-6">
              <div>
                <p className="text-[16px] font-medium tracking-[-0.01em]">People in this automation</p>
                <p className="mt-1 text-[12.5px] text-neutral-500">
                  {automation ? `${automation.counts.active} in progress · ${automation.counts.completed + automation.counts.stopped} finished` : "Save first to add people"}
                </p>
              </div>
              <Button size="sm" variant="secondary" disabled={!automation} onClick={() => setEnrollOpen(true)}>
                <UserPlus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
            <div className="scroll-slim max-h-[560px] overflow-y-auto border-t border-neutral-100">
              {enrollments.length === 0 ? (
                <p className="px-7 py-10 text-center text-[13px] text-neutral-500">Nobody yet.</p>
              ) : (
                <ul>
                  {enrollments.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 border-b border-neutral-100 px-7 py-3.5 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{e.businessName}</p>
                        <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                          {e.status === "ACTIVE"
                            ? e.nextRunAt
                              ? `Step ${Math.min(e.stepIndex + 1, f.steps.length)} · next ${relativeTime(e.nextRunAt)}`
                              : `Step ${e.stepIndex + 1}`
                            : e.stopReason ?? (e.status === "COMPLETED" ? "Finished" : "Stopped")}
                        </p>
                      </div>
                      <StatusDot color={e.status === "ACTIVE" ? "#1F9D4C" : e.status === "COMPLETED" ? "#525252" : "#A3A3A3"} label={e.status === "ACTIVE" ? "Active" : e.status === "COMPLETED" ? "Done" : "Stopped"} />
                      {e.status === "ACTIVE" && (
                        <IconButton label="Stop for this contact" size="sm" onClick={() => run(`stop${e.id}`, stopEnrollmentAction(e.id), "Stopped")}>
                          <X className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {automation && (
              <p className="flex items-center gap-1.5 border-t border-neutral-100 px-7 py-4 text-[12px] text-neutral-500">
                <Clock className="h-3.5 w-3.5" /> Last edited {formatDateTime(automation.updatedAt)}
              </p>
            )}
          </Card>
        </div>
      </div>

      {automation && <EnrollModal open={enrollOpen} onClose={() => setEnrollOpen(false)} automationId={automation.id} />}
      {dialog}
    </div>
  );
}

function AddBetween({ onAdd, last }: { onAdd: (t: "email" | "wait") => void; last?: boolean }) {
  return (
    <div className={cn("group flex items-center gap-2 pl-[25px]", last ? "pt-3" : "py-3")}>
      <span className="h-6 w-px bg-neutral-200" />
      <div className={cn("flex items-center gap-1.5 transition-opacity", last ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
        <button onClick={() => onAdd("email")} className="flex h-8 items-center gap-1.5 rounded-full bg-page px-3 text-[12.5px] hover:bg-neutral-200/80">
          <Plus className="h-3.5 w-3.5" /> Email
        </button>
        <button onClick={() => onAdd("wait")} className="flex h-8 items-center gap-1.5 rounded-full bg-page px-3 text-[12.5px] hover:bg-neutral-200/80">
          <Plus className="h-3.5 w-3.5" /> Wait
        </button>
      </div>
    </div>
  );
}

function EnrollModal({ open, onClose, automationId }: { open: boolean; onClose: () => void; automationId: string }) {
  const { run, busy } = useEmailAction();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; businessName: string; email: string; contactName: string }[]>([]);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await searchContactsAction(q);
      if (live && r.ok) setResults(r.data);
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add contacts"
      subtitle="Only subscribed contacts with an email address are listed."
      className="max-w-[560px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!picked.size || busy === "enroll"}
            onClick={async () => {
              const r = await run("enroll", enrollContactsAction(automationId, [...picked.keys()]), (d) => `${d.enrolled} added${d.skipped ? ` · ${d.skipped} already in it` : ""}`);
              if (r) {
                setPicked(new Map());
                onClose();
              }
            }}
          >
            Add {picked.size || ""}
          </Button>
        </>
      }
    >
      <label className="flex h-11 items-center gap-2.5 rounded-xl bg-page px-4">
        <Search className="h-4 w-4 text-neutral-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, contact or email" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-500" />
      </label>
      <ul className="mt-3 flex flex-col">
        {results.map((r) => {
          const on = picked.has(r.id);
          return (
            <li key={r.id}>
              <button
                onClick={() =>
                  setPicked((m) => {
                    const n = new Map(m);
                    on ? n.delete(r.id) : n.set(r.id, r.businessName);
                    return n;
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page"
              >
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-white" : "border-neutral-300")}>
                  {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">{r.businessName}</span>
                  <span className="block truncate text-[12px] text-neutral-500">{[r.contactName, r.email].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="px-3 py-6 text-[13px] text-neutral-500">No matching contacts.</li>}
      </ul>
    </Modal>
  );
}
