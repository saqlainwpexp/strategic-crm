"use client";

import { useEffect, useMemo, useState } from "react";
import { SocialAdmin } from "@/components/outreach/SocialAdmin";
import { Layers, Pencil, Plus, Shuffle, Upload } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Form";
import { Chip, StatusDot } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Overlay";
import { CsvImportModal } from "@/components/leads/CsvImportModal";
import { BrandingTab } from "./BrandingTab";
import { PIPELINE_STAGES, STAGE_DOT, STAGE_LABELS, TEMP_COLOR } from "@/lib/constants";
import type { CustomFieldDef, CustomFieldType, Pool } from "@/lib/types";
import { DIALER_OPTIONS } from "@/lib/dial";
import { formatDateTime } from "@/lib/date";
import { cn } from "@/lib/utils";
import { currency } from "@/lib/currency";
import { TIMEZONES, appTimeZone, tzAbbrev } from "@/lib/date";

type Tab = "branding" | "fields" | "pools" | "imports" | "social" | "settings";
const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "SELECT", label: "Dropdown" },
  { value: "BOOLEAN", label: "Yes / No" },
  { value: "URL", label: "Link" },
];

export function AdminView() {
  const [tab, setTab] = useState<Tab>("branding");
  return (
    <div>
      <PageHeader
        title="Admin"
        subtitle="White-label branding, custom fields, lead pools, imports and system configuration."
        actions={
          <Segmented
            className="border border-black/[0.06] bg-white"
            value={tab}
            onChange={setTab}
            options={[
              { value: "branding", label: "Branding" },
              { value: "fields", label: "Custom fields" },
              { value: "pools", label: "Lead pools" },
              { value: "imports", label: "Imports" },
              { value: "social", label: "Social" },
              { value: "settings", label: "Settings" },
            ]}
          />
        }
      />
      {tab === "branding" && <BrandingTab />}
      {tab === "fields" && <FieldsTab />}
      {tab === "pools" && <PoolsTab />}
      {tab === "imports" && <ImportsTab />}
      {tab === "social" && <SocialAdmin />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

// ─── Custom fields ───────────────────────────────────────────

function FieldsTab() {
  const { data, saveCustomField } = useCrm();
  const [editing, setEditing] = useState<CustomFieldDef | "new" | null>(null);
  const filled = (key: string) => data.leads.filter((l) => l.customFields[key] !== undefined && l.customFields[key] !== null && l.customFields[key] !== "").length;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
        <div>
          <h2 className="text-[18px] font-medium tracking-[-0.01em]">Custom lead fields</h2>
          <p className="mt-1.5 text-[13px] text-neutral-500">Extra fields shown on every lead, in the lead form and in CSV column mapping.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add field
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12.5px] text-neutral-700">
              {["Field", "Key", "Type", "Options", "Filled on", "Required", "Active", ""].map((h, i) => (
                <th key={h || i} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.customFields.map((f) => (
              <tr key={f.id} className={cn("border-b border-neutral-100 last:border-0", !f.active && "text-neutral-400")}>
                <td className="py-4 pl-7 pr-4 font-medium">{f.name}</td>
                <td className="py-4 pr-4 font-mono text-[12px] text-neutral-500">{f.key}</td>
                <td className="py-4 pr-4">
                  <Chip>{FIELD_TYPES.find((t) => t.value === f.type)?.label}</Chip>
                </td>
                <td className="max-w-[220px] truncate py-4 pr-4 text-neutral-500">{f.options.length ? f.options.join(", ") : "—"}</td>
                <td className="py-4 pr-4 tabular-nums">{filled(f.key)} leads</td>
                <td className="py-4 pr-4">{f.required ? "Yes" : "No"}</td>
                <td className="py-4 pr-4">
                  <Toggle checked={f.active} onChange={(v) => saveCustomField({ ...f, active: v })} />
                </td>
                <td className="py-4 pr-7 text-right">
                  <button aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)} className="grid h-9 w-9 place-items-center rounded-full bg-page hover:bg-neutral-200">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FieldModal field={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function FieldModal({ field, onClose }: { field: CustomFieldDef | "new" | null; onClose: () => void }) {
  const { data, saveCustomField } = useCrm();
  const editing = field && field !== "new" ? field : null;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    if (!field) return;
    setName(editing?.name ?? "");
    setKey(editing?.key ?? "");
    setType(editing?.type ?? "TEXT");
    setOptions(editing?.options.join(", ") ?? "");
    setRequired(editing?.required ?? false);
    setKeyTouched(!!editing);
  }, [field, editing]);

  const autoKey = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const finalKey = keyTouched ? key : autoKey;
  const clash = data.customFields.some((f) => f.key === finalKey && f.id !== editing?.id);
  const valid = name.trim() && finalKey && !clash && (type !== "SELECT" || options.trim());

  return (
    <Modal
      open={!!field}
      onClose={onClose}
      title={editing ? `Edit “${editing.name}”` : "Add a custom field"}
      subtitle="Changes apply to every lead immediately."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              saveCustomField({
                id: editing?.id,
                name: name.trim(),
                key: finalKey,
                type,
                options: type === "SELECT" ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
                required,
                active: editing?.active ?? true,
              });
              onClose();
            }}
          >
            {editing ? "Save field" : "Add field"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Label" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly ad spend" />
        </Field>
        <Field label="Key" hint={clash ? "Another field already uses this key." : "Used in CSV headers and integrations."}>
          <Input
            value={finalKey}
            disabled={!!editing}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""));
            }}
            className={cn("font-mono text-[13px]", clash && "border-rose-300")}
          />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Required">
          <div className="flex h-11 items-center">
            <Toggle checked={required} onChange={setRequired} label={required ? "Required on new leads" : "Optional"} />
          </div>
        </Field>
        {type === "SELECT" && (
          <Field label="Options" hint="Separate with commas" className="sm:col-span-2">
            <Textarea value={options} onChange={(e) => setOptions(e.target.value)} className="min-h-[88px]" placeholder="Under 50k, 50k–200k, 200k+" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

// ─── Pools ───────────────────────────────────────────────────

function PoolsTab() {
  const { data, assignLeads } = useCrm();
  const [editing, setEditing] = useState<Pool | "new" | null>(null);
  const reps = data.users.filter((u) => u.role === "SALES");

  const stats = useMemo(
    () =>
      data.pools.map((p) => {
        const leads = data.leads.filter((l) => l.poolId === p.id);
        return {
          pool: p,
          total: leads.length,
          unassigned: leads.filter((l) => !l.assignedToId),
          byRep: data.users
            .filter((u) => u.role === "SALES" || u.role === "BD")
            .map((u) => ({ user: u, count: leads.filter((l) => l.assignedToId === u.id).length }))
            .filter((x) => x.count > 0),
        };
      }),
    [data.pools, data.leads, data.users]
  );

  const distribute = (ids: string[]) => {
    if (!reps.length) return;
    // Round-robin, one call per rep so each rep's batch is applied together.
    reps.forEach((r, i) => {
      const batch = ids.filter((_, idx) => idx % reps.length === i);
      if (batch.length) assignLeads(batch, { assignedToId: r.id });
    });
  };

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New pool
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ pool, total, unassigned, byRep }) => (
          <Card key={pool.id} className="flex flex-col p-7">
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-page">
                <Layers className="h-5 w-5" strokeWidth={1.6} />
              </span>
              <button aria-label={`Edit ${pool.name}`} onClick={() => setEditing(pool)} className="grid h-9 w-9 place-items-center rounded-full bg-page hover:bg-neutral-200">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-5 text-[17px] font-medium tracking-[-0.01em]">{pool.name}</p>
            <p className="mt-1 text-[13px] text-neutral-500">{pool.description || "—"}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-soft px-4 py-3.5">
                <p className="text-[11.5px] text-neutral-500">Leads</p>
                <p className="mt-1.5 text-[20px] tabular-nums leading-none">{total}</p>
              </div>
              <div className={cn("rounded-2xl px-4 py-3.5", unassigned.length ? "bg-brand-50" : "bg-soft")}>
                <p className="text-[11.5px] text-neutral-500">Unassigned</p>
                <p className="mt-1.5 text-[20px] tabular-nums leading-none">{unassigned.length}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {byRep.map(({ user, count }) => (
                <span key={user.id} className="inline-flex items-center gap-2 rounded-full bg-page py-1 pl-1 pr-3 text-[12.5px]">
                  <Avatar name={user.name} size={24} /> {count}
                </span>
              ))}
            </div>
            <div className="mt-auto pt-6">
              <Button variant={unassigned.length ? "primary" : "secondary"} className="w-full" disabled={!unassigned.length} onClick={() => distribute(unassigned.map((l) => l.id))}>
                <Shuffle className="h-4 w-4" /> {unassigned.length ? `Distribute ${unassigned.length} to sales reps` : "All leads assigned"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <PoolModal pool={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function PoolModal({ pool, onClose }: { pool: Pool | "new" | null; onClose: () => void }) {
  const { savePool } = useCrm();
  const editing = pool && pool !== "new" ? pool : null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (!pool) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
  }, [pool, editing]);
  return (
    <Modal
      open={!!pool}
      onClose={onClose}
      title={editing ? "Edit pool" : "New lead pool"}
      subtitle="Pools group leads by list, city or campaign so they can be assigned in batches."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              savePool({ id: editing?.id, name: name.trim(), description: description.trim() });
              onClose();
            }}
          >
            Save pool
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lahore — Dental clinics" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[88px]" />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Imports ─────────────────────────────────────────────────

function ImportsTab() {
  const { data, userById } = useCrm();
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
        <div>
          <h2 className="text-[18px] font-medium tracking-[-0.01em]">Lead imports</h2>
          <p className="mt-1.5 text-[13px] text-neutral-500">Every CSV upload, with duplicates and errors caught on the way in.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4" /> Import CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[12.5px] text-neutral-700">
              {["File", "Rows", "Imported", "Duplicates", "Errors", "Pool", "Uploaded by", "When"].map((h, i) => (
                <th key={h} className={cn("border-y border-neutral-100 py-3.5 pr-4 font-normal", i === 0 && "pl-7")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.imports.map((imp) => (
              <tr key={imp.id} className="border-b border-neutral-100 last:border-0">
                <td className="py-4 pl-7 pr-4 font-medium">{imp.fileName}</td>
                <td className="py-4 pr-4 tabular-nums">{imp.rowCount}</td>
                <td className="py-4 pr-4 tabular-nums">
                  <StatusDot color="#22C55E" label={imp.successCount} />
                </td>
                <td className="py-4 pr-4 tabular-nums text-neutral-600">{imp.duplicateCount}</td>
                <td className="py-4 pr-4 tabular-nums">{imp.errorCount ? <span className="text-[#E5484D]">{imp.errorCount}</span> : 0}</td>
                <td className="py-4 pr-4">{data.pools.find((p) => p.id === imp.poolId)?.name ?? "—"}</td>
                <td className="py-4 pr-4">{userById(imp.uploadedById)?.name ?? "—"}</td>
                <td className="whitespace-nowrap py-4 pr-7 text-neutral-600">{formatDateTime(imp.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CsvImportModal open={open} onClose={() => setOpen(false)} />
    </Card>
  );
}

// ─── Settings ────────────────────────────────────────────────

function SettingsTab() {
  const { data, updateSettings } = useCrm();
  const [hot, setHot] = useState(data.settings.hotThreshold);
  const [warm, setWarm] = useState(data.settings.warmThreshold);
  const [dialer, setDialer] = useState(data.settings.dialerScheme);
  const [reminder, setReminder] = useState(data.settings.reminderMinutes);
  const valid = warm > 0 && hot > warm && hot <= 100;
  const dirty =
    hot !== data.settings.hotThreshold ||
    warm !== data.settings.warmThreshold ||
    dialer !== data.settings.dialerScheme ||
    reminder !== data.settings.reminderMinutes;

  const counts = useMemo(
    () => ({
      hot: data.leads.filter((l) => l.leadScore >= hot).length,
      warm: data.leads.filter((l) => l.leadScore >= warm && l.leadScore < hot).length,
      cold: data.leads.filter((l) => l.leadScore < warm).length,
    }),
    [data.leads, hot, warm]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="p-7">
        <CardHeader title="Lead temperature" subtitle="How the 0–100 lead score maps to Cold, Warm and Hot." />
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Hot from score">
            <Input type="number" min={1} max={100} value={hot} onChange={(e) => setHot(Number(e.target.value))} />
          </Field>
          <Field label="Warm from score">
            <Input type="number" min={1} max={99} value={warm} onChange={(e) => setWarm(Number(e.target.value))} />
          </Field>
        </div>
        <div className="mt-8 flex h-3 overflow-hidden rounded-full">
          <span style={{ width: `${warm}%`, background: TEMP_COLOR.COLD }} />
          <span style={{ width: `${Math.max(0, hot - warm)}%`, background: TEMP_COLOR.WARM }} />
          <span style={{ width: `${100 - hot}%`, background: TEMP_COLOR.HOT }} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[12.5px]">
          <span>
            <span className="text-neutral-500">Cold 0–{warm - 1}</span>
            <span className="block text-[18px] tabular-nums">{counts.cold}</span>
          </span>
          <span>
            <span className="text-neutral-500">
              Warm {warm}–{hot - 1}
            </span>
            <span className="block text-[18px] tabular-nums">{counts.warm}</span>
          </span>
          <span>
            <span className="text-neutral-500">Hot {hot}–100</span>
            <span className="block text-[18px] tabular-nums">{counts.hot}</span>
          </span>
        </div>
        {!valid && <p className="mt-4 text-[12.5px] text-rose-600">Hot must be higher than Warm, and both between 1 and 100.</p>}
      </Card>

      <Card className="p-7">
        <CardHeader title="Dialer" subtitle="What happens when a rep clicks Call." />
        <div className="flex flex-col gap-3">
          {DIALER_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setDialer(o.value)}
              className={cn(
                "flex items-start gap-4 rounded-2xl p-5 text-left transition-shadow",
                dialer === o.value ? "bg-white shadow-[0_0_0_1.5px_rgb(var(--ink))]" : "bg-soft hover:shadow-[0_0_0_1px_rgba(10,10,10,0.1)]"
              )}
            >
              <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", dialer === o.value ? "border-ink" : "border-neutral-300")}>
                {dialer === o.value && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
              </span>
              <span>
                <span className="block text-[14px] font-medium">
                  {o.label} <span className="ml-1 font-mono text-[12px] font-normal text-neutral-500">{o.value}</span>
                </span>
                <span className="mt-1 block text-[12.5px] text-neutral-500">{o.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-7">
        <CardHeader title="Follow-up reminders" subtitle="Reps get an in-app alert (and a desktop notification if allowed) before each follow-up call or meeting, and again when it's due." />
        <div className="flex flex-wrap gap-2">
          {[10, 15, 30, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setReminder(m)}
              className={cn("h-10 rounded-full px-4 text-[13px] transition-colors", reminder === m ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200")}
            >
              {m} min before
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-7">
        <CardHeader title="Region" subtitle="Applied to every date, time and amount." />
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Timezone">
            <Input value={`${TIMEZONES.find((t) => t.id === appTimeZone())?.label ?? appTimeZone()} · now ${tzAbbrev()} (change in Branding)`} disabled />
          </Field>
          <Field label="Currency">
            <Input value={`${currency().code} — ${currency().name} (change in Branding)`} disabled />
          </Field>
        </div>
      </Card>

      <Card className="p-7">
        <CardHeader title="Pipeline stages" subtitle="The 10 stages every lead moves through." />
        <div className="flex flex-wrap gap-2">
          {PIPELINE_STAGES.map((s, i) => (
            <span key={s} className="inline-flex h-9 items-center gap-2 rounded-full bg-page pl-3 pr-4 text-[13px]">
              <span className="text-[11px] tabular-nums text-neutral-400">{i + 1}</span>
              <span className="h-2 w-2 rounded-[2px]" style={{ background: STAGE_DOT[s] }} />
              {STAGE_LABELS[s]}
            </span>
          ))}
        </div>
      </Card>

      <div className="flex justify-end gap-3 lg:col-span-2">
        <Button
          variant="secondary"
          disabled={!dirty}
          onClick={() => {
            setHot(data.settings.hotThreshold);
            setWarm(data.settings.warmThreshold);
            setDialer(data.settings.dialerScheme);
            setReminder(data.settings.reminderMinutes);
          }}
        >
          Reset
        </Button>
        <Button disabled={!dirty || !valid} onClick={() => updateSettings({ hotThreshold: hot, warmThreshold: warm, dialerScheme: dialer, reminderMinutes: reminder })}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
