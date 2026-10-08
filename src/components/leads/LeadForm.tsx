"use client";

import { useEffect, useState } from "react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Form";
import {
  AGENCY_SERVICES,
  LEAD_SOURCES,
  PIPELINE_STAGES,
  PRIORITIES,
  PRIORITY_LABELS,
  STAGE_LABELS,
  TEMP_LABELS,
  type AgencyService,
  type PipelineStage,
  type Priority,
} from "@/lib/constants";
import type { CustomFieldValue, Lead } from "@/lib/types";
import { currency } from "@/lib/currency";

type Draft = Omit<Lead, "id" | "createdAt">;

function emptyDraft(viewerId: string, assign: boolean): Draft {
  return {
    businessName: "",
    address: "",
    city: "",
    website: "",
    issues: "",
    suggestedServices: "",
    phone: "",
    email: "",
    priority: "MEDIUM",
    source: "Cold List",
    decisionMakerName: "",
    leadScore: 50,
    stage: "LEAD",
    service: "Web Design",
    estimatedValue: 0,
    assignedToId: assign ? null : viewerId,
    poolId: null,
    notes: "",
    customFields: {},
    lastContactedAt: null,
    nextFollowUpAt: null,
    closedAt: null,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-9 last:mb-0">
      <legend className="mb-5 text-[12px] font-medium uppercase tracking-[0.08em] text-neutral-400">{title}</legend>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function LeadForm({ open, onClose, lead }: { open: boolean; onClose: () => void; lead?: Lead | null }) {
  const { data, viewer, perms, addLead, updateLead, moveLead, tempOf } = useCrm();
  const [d, setD] = useState<Draft>(() => emptyDraft(viewer.id, perms.assignLeads));
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    if (lead) {
      const { id: _id, createdAt: _c, ...rest } = lead;
      setD(rest);
    } else {
      setD(emptyDraft(viewer.id, perms.assignLeads));
    }
  }, [open, lead, viewer.id, perms.assignLeads]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setCustom = (key: string, v: CustomFieldValue) => setD((x) => ({ ...x, customFields: { ...x.customFields, [key]: v } }));
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");
  const fields = data.customFields.filter((f) => f.active);
  const valid = d.businessName.trim() && d.phone.trim();

  const save = () => {
    setTried(true);
    if (!valid) return;
    const clean = { ...d, businessName: d.businessName.trim(), phone: d.phone.trim() };
    if (lead) {
      const { stage, ...rest } = clean;
      updateLead(lead.id, rest);
      if (stage !== lead.stage) moveLead(lead.id, stage);
    } else {
      addLead(clean);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="max-w-[760px]"
      title={lead ? `Edit ${lead.businessName}` : "Add a new lead"}
      subtitle="Fields marked * are required. Custom fields are managed by the super admin."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>{lead ? "Save changes" : "Add lead"}</Button>
        </>
      }
    >
      <Section title="Business">
        <Field label="Business name" required className="sm:col-span-2">
          <Input
            value={d.businessName}
            onChange={(e) => set("businessName", e.target.value)}
            placeholder="e.g. Zahra Boutique"
            aria-invalid={tried && !d.businessName.trim()}
            className={tried && !d.businessName.trim() ? "border-rose-300" : ""}
          />
        </Field>
        <Field label="Address">
          <Input value={d.address} onChange={(e) => set("address", e.target.value)} placeholder="Area, City" />
        </Field>
        <Field label="City">
          <Input value={d.city} onChange={(e) => set("city", e.target.value)} placeholder="Lahore" />
        </Field>
        <Field label="Website" className="sm:col-span-2">
          <Input value={d.website} onChange={(e) => set("website", e.target.value)} placeholder="example.pk (leave empty if none)" />
        </Field>
      </Section>

      <Section title="Contact">
        <Field label="Decision maker name">
          <Input value={d.decisionMakerName} onChange={(e) => set("decisionMakerName", e.target.value)} placeholder="Owner / manager" />
        </Field>
        <Field label="Phone" required>
          <Input
            value={d.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+92 300 1234567"
            className={tried && !d.phone.trim() ? "border-rose-300" : ""}
          />
        </Field>
        <Field label="Email" className="sm:col-span-2">
          <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="owner@business.pk" />
        </Field>
      </Section>

      <Section title="Opportunity">
        <Field label="Issues they're facing" hint="One per line" className="sm:col-span-2">
          <Textarea value={d.issues} onChange={(e) => set("issues", e.target.value)} />
        </Field>
        <Field label="Our suggested services / solutions" hint="One per line" className="sm:col-span-2">
          <Textarea value={d.suggestedServices} onChange={(e) => set("suggestedServices", e.target.value)} />
        </Field>
        <Field label="Primary service">
          <Select value={d.service} onChange={(e) => set("service", e.target.value as AgencyService)}>
            {AGENCY_SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label={`Estimated value (${currency().code})`}>
          <Input
            type="number"
            min={0}
            step={5000}
            value={d.estimatedValue || ""}
            onChange={(e) => set("estimatedValue", Number(e.target.value) || 0)}
            placeholder="250000"
          />
        </Field>
        <Field label="Priority">
          <Select value={d.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Lead score — ${d.leadScore}/100 (${TEMP_LABELS[tempOf(d.leadScore)]})`}>
          <input
            type="range"
            min={0}
            max={100}
            value={d.leadScore}
            onChange={(e) => set("leadScore", Number(e.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer accent-brand"
          />
        </Field>
        <Field label="Source">
          <Select value={d.source} onChange={(e) => set("source", e.target.value)}>
            {[...new Set([...LEAD_SOURCES, d.source])].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pipeline stage">
          <Select value={d.stage} onChange={(e) => set("stage", e.target.value as PipelineStage)}>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      {perms.assignLeads && (
        <Section title="Assignment">
          <Field label="Assigned rep">
            <Select value={d.assignedToId ?? ""} onChange={(e) => set("assignedToId", e.target.value || null)}>
              <option value="">Unassigned</option>
              {reps.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lead pool">
            <Select value={d.poolId ?? ""} onChange={(e) => set("poolId", e.target.value || null)}>
              <option value="">No pool</option>
              {data.pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </Section>
      )}

      {fields.length > 0 && (
        <Section title="Custom fields">
          {fields.map((f) => {
            const v = d.customFields[f.key];
            if (f.type === "BOOLEAN")
              return (
                <Field key={f.id} label={f.name}>
                  <div className="flex h-11 items-center">
                    <Toggle checked={!!v} onChange={(x) => setCustom(f.key, x)} label={v ? "Yes" : "No"} />
                  </div>
                </Field>
              );
            if (f.type === "SELECT")
              return (
                <Field key={f.id} label={f.name} required={f.required}>
                  <Select value={String(v ?? "")} onChange={(e) => setCustom(f.key, e.target.value || null)}>
                    <option value="">—</option>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </Select>
                </Field>
              );
            return (
              <Field key={f.id} label={f.name} required={f.required}>
                <Input
                  type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : "text"}
                  value={v === null || v === undefined ? "" : String(v)}
                  onChange={(e) =>
                    setCustom(f.key, f.type === "NUMBER" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)
                  }
                />
              </Field>
            );
          })}
        </Section>
      )}

      <Section title="Notes">
        <Field label="Notes or additional details" className="sm:col-span-2">
          <Textarea value={d.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </Section>
    </Modal>
  );
}
