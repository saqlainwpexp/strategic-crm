"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { PIPELINE_STAGES, STAGE_LABELS, TEMP_LABELS, type Temperature } from "@/lib/constants";
import { TRIGGER_LABELS, type AutomationTrigger, type WaitUnit } from "@/lib/email";
import { ACTION_HINTS, ACTION_LABELS, CONDITION_LABELS, type ActionKind, type ConditionKind, type FlowNodeData, type FlowNodeType } from "@/lib/automation-flow";
import type { EmailAccountView, TemplateView } from "@/lib/email-types";
import { EmailEditor } from "../EmailEditor";
import { EmailPreview } from "../EmailPreview";
import { SendTestButton } from "../SendTestButton";
import { NODE_META } from "./FlowNodes";

type Props = {
  type: FlowNodeType;
  data: FlowNodeData;
  onChange: (d: FlowNodeData) => void;
  onClose: () => void;
  trigger: AutomationTrigger;
  triggerValue: string;
  onTrigger: (t: AutomationTrigger, v: string) => void;
  tags: string[];
  reps: { id: string; name: string }[];
  templates: TemplateView[];
  accounts: EmailAccountView[];
};

const TAG_CONDITIONS: ConditionKind[] = ["has_tag", "stage_is", "temperature_is"];

export function NodePanel(p: Props) {
  const m = NODE_META[p.type];
  const [emailOpen, setEmailOpen] = useState(false);
  const d = p.data;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-[11px]" style={{ background: m.tint, color: m.color }}>
            <m.icon className="h-4 w-4" />
          </span>
          <p className="text-[15px] font-medium">{m.badge}</p>
        </div>
        <IconButton label="Close" size="sm" onClick={p.onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-6 py-6">
        <div className="flex flex-col gap-5">
          {d.kind === "trigger" && (
            <>
              <Field label="Start the workflow when…">
                <Select value={p.trigger} onChange={(e) => p.onTrigger(e.target.value as AutomationTrigger, "")}>
                  {(Object.keys(TRIGGER_LABELS) as AutomationTrigger[]).map((t) => (
                    <option key={t} value={t}>
                      {TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              {p.trigger === "STAGE_CHANGED" && (
                <Field label="Stage">
                  <Select value={p.triggerValue} onChange={(e) => p.onTrigger(p.trigger, e.target.value)}>
                    <option value="">Choose a stage…</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {p.trigger === "TAG_ADDED" && <TagInput label="Tag" value={p.triggerValue} tags={p.tags} onChange={(v) => p.onTrigger(p.trigger, v)} />}
              <Hint>
                {p.trigger === "MANUAL"
                  ? "Add people from Contacts (select → Add to automation) or with “Add people” below the canvas."
                  : p.trigger === "TAG_ADDED"
                    ? "Tip: tag a ListKit import on upload and this workflow starts for the whole list."
                    : p.trigger === "EMAIL_REPLIED"
                      ? "Runs for anyone who replies to a campaign or workflow email — perfect for handing them to sales calls."
                      : p.trigger === "LEAD_CREATED"
                        ? "Every new lead with an email address — added by hand or imported — starts here."
                        : "Fires when a lead enters that pipeline stage (board, call outcome or meeting update)."}
              </Hint>
            </>
          )}

          {d.kind === "email" && (
            <>
              <Field label="Subject">
                <Input value={d.subject} onChange={(e) => p.onChange({ ...d, subject: e.target.value })} placeholder="Quick idea for {{business_name}}" />
              </Field>
              <div className="overflow-hidden rounded-2xl border border-black/[0.08]">
                <EmailPreview html={d.html} scale={0.62} height={420} className="pointer-events-none" />
              </div>
              <Button variant="secondary" onClick={() => setEmailOpen(true)}>
                <Pencil className="h-4 w-4" /> {d.html ? "Edit email" : "Write email"}
              </Button>
              <Hint>Sent from your inboxes in rotation, with open/click tracking and an unsubscribe link.</Hint>
              <EmailModal open={emailOpen} onClose={() => setEmailOpen(false)} data={d} onChange={p.onChange} templates={p.templates} accounts={p.accounts} />
            </>
          )}

          {d.kind === "wait" && (
            <>
              <div className="grid grid-cols-[1fr_1.3fr] gap-3">
                <Field label="Wait">
                  <Input type="number" min={1} max={365} value={d.amount} onChange={(e) => p.onChange({ ...d, amount: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
                </Field>
                <Field label="Unit">
                  <Select value={d.unit} onChange={(e) => p.onChange({ ...d, unit: e.target.value as WaitUnit })}>
                    <option value="minutes">minutes</option>
                    <option value="hours">hours</option>
                    <option value="days">days</option>
                  </Select>
                </Field>
              </div>
              <Hint>Put a wait before a condition so the contact has time to open, click or reply.</Hint>
            </>
          )}

          {d.kind === "condition" && (
            <>
              <Field label="Check if the contact…">
                <Select value={d.condition} onChange={(e) => p.onChange({ ...d, condition: e.target.value as ConditionKind, value: "" })}>
                  {(Object.keys(CONDITION_LABELS) as ConditionKind[]).map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
              {d.condition === "has_tag" && <TagInput label="Tag" value={d.value} tags={p.tags} onChange={(v) => p.onChange({ ...d, value: v })} />}
              {d.condition === "stage_is" && (
                <Field label="Stage">
                  <Select value={d.value} onChange={(e) => p.onChange({ ...d, value: e.target.value })}>
                    <option value="">Choose…</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {d.condition === "temperature_is" && (
                <Field label="Temperature">
                  <Select value={d.value} onChange={(e) => p.onChange({ ...d, value: e.target.value })}>
                    <option value="">Choose…</option>
                    {(["HOT", "WARM", "COLD"] as Temperature[]).map((t) => (
                      <option key={t} value={t}>
                        {TEMP_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Hint>
                Connect the <b className="text-[#16A34A]">Yes</b> and <b className="text-[#DC2626]">No</b> dots to what should happen next. A side left unconnected ends the workflow for those contacts.
                {!TAG_CONDITIONS.includes(d.condition) && d.condition !== "has_phone" && " “Last email” means the most recent email this workflow sent them."}
              </Hint>
            </>
          )}

          {d.kind === "action" && (
            <>
              <Field label="Do this">
                <Select value={d.action} onChange={(e) => p.onChange({ ...d, action: e.target.value as ActionKind, value: "" })}>
                  {(Object.keys(ACTION_LABELS) as ActionKind[]).map((a) => (
                    <option key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              {(d.action === "add_tag" || d.action === "remove_tag") && <TagInput label="Tag" value={d.value} tags={p.tags} onChange={(v) => p.onChange({ ...d, value: v })} />}
              {d.action === "move_stage" && (
                <Field label="Stage">
                  <Select value={d.value} onChange={(e) => p.onChange({ ...d, value: e.target.value })}>
                    <option value="">Choose…</option>
                    {PIPELINE_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {(d.action === "assign_rep" || d.action === "send_to_calls") && (
                <Field label="Rep" hint={d.action === "send_to_calls" ? "Keeps the current rep if the lead already has one." : undefined}>
                  <Select value={d.value} onChange={(e) => p.onChange({ ...d, value: e.target.value })}>
                    <option value="">Share evenly between sales reps</option>
                    {p.reps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Hint>{ACTION_HINTS[d.action]}</Hint>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-soft px-4 py-3.5 text-[12.5px] leading-relaxed text-neutral-600">{children}</p>;
}

function TagInput({ label, value, tags, onChange }: { label: string; value: string; tags: string[]; onChange: (v: string) => void }) {
  const listId = `tags-${label}`;
  return (
    <Field label={label}>
      <Input list={listId} value={value} maxLength={40} placeholder="e.g. ListKit — Dentists" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {tags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </Field>
  );
}

function EmailModal({
  open,
  onClose,
  data,
  onChange,
  templates,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  data: Extract<FlowNodeData, { kind: "email" }>;
  onChange: (d: FlowNodeData) => void;
  templates: TemplateView[];
  accounts: EmailAccountView[];
}) {
  const [draft, setDraft] = useState(data);
  useEffect(() => {
    if (open) setDraft(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Workflow email"
      subtitle="Personalise with the Personalise menu — {{first_name}}, {{business_name}} and more."
      className="max-w-[880px]"
      footer={
        <>
          <SendTestButton accounts={accounts.filter((a) => a.status !== "DISCONNECTED")} subject={draft.subject} html={draft.html} />
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end">
          <Field label="Subject" className="flex-1">
            <Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Quick idea for {{business_name}}" />
          </Field>
          {templates.length > 0 && (
            <Select
              value=""
              className="md:w-[240px]"
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) setDraft({ ...draft, subject: t.subject || draft.subject, html: t.html });
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
        <EmailEditor value={draft.html} onChange={(html) => setDraft((x) => ({ ...x, html }))} minHeight={280} />
      </div>
    </Modal>
  );
}
