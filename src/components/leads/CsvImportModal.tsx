"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Check, CircleAlert, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Avatar } from "@/components/ui/Avatar";
import type { CustomFieldDef, CustomFieldValue, Lead } from "@/lib/types";
import type { AgencyService, Priority } from "@/lib/constants";
import { cn, uid } from "@/lib/utils";
import { isValidEmail } from "@/lib/email";

type Row = Record<string, string>;
type Step = "upload" | "map" | "review" | "done";
type Strategy = "pool" | "one" | "round";

const CORE: { key: string; label: string; aliases: string[]; required?: boolean }[] = [
  { key: "businessName", label: "Business name", aliases: ["business name", "business", "company", "company name", "name", "business_name"], required: true },
  { key: "phone", label: "Phone", aliases: ["phone", "phone number", "mobile", "contact number", "number", "tel", "telephone", "cell"], required: true },
  { key: "address", label: "Address", aliases: ["address", "location", "full address", "street address"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "website", label: "Website", aliases: ["website", "site", "url", "web", "website url"] },
  { key: "issues", label: "Issues they're facing", aliases: ["issues", "issues they are facing", "problems", "pain points", "issue", "pain point"] },
  { key: "suggestedServices", label: "Suggested services / solutions", aliases: ["suggested services", "solutions", "our suggested services", "suggested solutions", "solution", "our suggested services solutions", "services"] },
  { key: "email", label: "Email", aliases: ["email", "email address", "e mail", "mail"] },
  { key: "priority", label: "Priority", aliases: ["priority"] },
  { key: "source", label: "Source", aliases: ["source", "lead source"] },
  { key: "decisionMakerName", label: "Decision maker", aliases: ["decision maker", "decision maker name", "owner", "contact name", "contact person", "owner name"] },
  { key: "leadScore", label: "Lead score (0–100)", aliases: ["lead score", "score", "lead score out of 100"] },
  { key: "temperature", label: "Temperature (cold/warm/hot)", aliases: ["temperature", "lead temperature", "heat", "cold warm hot", "status"] },
  { key: "service", label: "Primary service", aliases: ["service", "primary service", "service type"] },
  { key: "estimatedValue", label: "Estimated value", aliases: ["estimated value", "value", "deal value", "budget"] },
  { key: "notes", label: "Notes / additional details", aliases: ["notes", "additional details", "comments", "note", "details"] },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const phoneKey = (p: string) => p.replace(/\D/g, "").slice(-10);

function autoMap(headers: string[], custom: CustomFieldDef[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const h of headers) {
    const n = norm(h);
    const core = CORE.find((c) => !used.has(c.key) && (c.aliases.includes(n) || norm(c.label) === n));
    const cf = custom.find((c) => !used.has(`cf:${c.key}`) && (norm(c.name) === n || norm(c.key) === n));
    const target = core?.key ?? (cf ? `cf:${cf.key}` : "ignore");
    if (target !== "ignore") used.add(target);
    out[h] = target;
  }
  return out;
}

function parseService(text: string): AgencyService {
  if (/ghl|highlevel|high level|crm|automation|text.?back/i.test(text)) return "GHL";
  if (/graphic|logo|brand|creative|social/i.test(text)) return "Graphic Design";
  return "Web Design";
}

export function CsvImportModal({
  open,
  onClose,
  onImported,
  mode = "calling",
}: {
  open: boolean;
  onClose: () => void;
  onImported?: (poolId: string | null) => void;
  /** Email marketing imports contacts: an email is required, a phone isn't. */
  mode?: "calling" | "email";
}) {
  const requiredKeys = mode === "email" ? ["businessName", "email"] : ["businessName", "phone"];
  const missingWhat = mode === "email" ? "a name or valid email" : "a name or phone";
  const { data, importLeads, savePool } = useCrm();
  const { branding } = useBranding();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [poolChoice, setPoolChoice] = useState<string>(data.pools[0]?.id ?? "__new");
  const [newPool, setNewPool] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("round");
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");
  const [oneRep, setOneRep] = useState(reps[0]?.id ?? "");
  const [roundReps, setRoundReps] = useState<string[]>(reps.filter((r) => r.role === "SALES").map((r) => r.id));
  const [skipDupes, setSkipDupes] = useState(true);
  const [result, setResult] = useState<{ imported: number; dupes: number; errors: number; poolId: string | null } | null>(null);

  const customFields = data.customFields.filter((f) => f.active);
  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError("");
    setResult(null);
    setNewPool("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const handleFile = (file: File) => {
    setParseError("");
    if (!/\.csv$/i.test(file.name)) {
      setParseError("Please choose a .csv file.");
      return;
    }
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !res.data.length) {
          setParseError("That file has no rows. Check it has a header row and at least one lead.");
          return;
        }
        setFileName(file.name);
        setHeaders(hs);
        setRows(res.data);
        setMapping(autoMap(hs, customFields));
        setStep("map");
      },
      error: (err) => setParseError(err.message),
    });
  };

  const downloadTemplate = () => {
    const cols = ["Business Name", "Address", "City", "Website", "Issues", "Suggested Services", "Phone", "Email", "Priority", "Source", "Decision Maker", "Lead Score", "Service", "Estimated Value", "Notes", ...customFields.map((f) => f.name)];
    const sample = [
      ["Sunrise Dental Care", "Gulberg III, Lahore", "Lahore", "sunrisedental.pk", "Outdated website; Missed calls after hours", "Website redesign; GHL missed-call text-back", "+92 300 1234567", "info@sunrisedental.pk", "High", "Google Maps", "Dr. Ahmed Khan", "78", "GHL", "450000", "Owner prefers WhatsApp", ...customFields.map(() => "")],
      ["Karachi Coffee Co.", "Clifton, Karachi", "Karachi", "", "No website", "Responsive business website", "+92 321 7654321", "", "Medium", "Instagram", "Sara Malik", "55", "Web Design", "250000", "", ...customFields.map(() => "")],
    ];
    const csv = Papa.unparse([cols, ...sample]);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${branding.appName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-lead-template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const mappedTargets = new Set(Object.values(mapping));
  const missingRequired = CORE.filter((c) => requiredKeys.includes(c.key) && !mappedTargets.has(c.key));

  // Build leads + classify rows
  const analysis = useMemo(() => {
    if (step !== "review" && step !== "done") return null;
    const headerFor = new Map<string, string>();
    for (const [h, t] of Object.entries(mapping)) if (t !== "ignore") headerFor.set(t, h);
    const get = (row: Row, t: string) => (headerFor.has(t) ? String(row[headerFor.get(t)!] ?? "").trim() : "");

    const existingPhones = new Set(data.leads.map((l) => phoneKey(l.phone)).filter(Boolean));
    const existingEmails = new Set(data.leads.map((l) => l.email.toLowerCase()).filter(Boolean));
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    const ready: Omit<Lead, "id" | "createdAt">[] = [];
    let dupes = 0;
    let errors = 0;
    for (const row of rows) {
      const businessName = get(row, "businessName");
      const phone = get(row, "phone");
      const email = get(row, "email").toLowerCase();
      if (!businessName || (mode === "email" ? !isValidEmail(email) : !phone)) {
        errors++;
        continue;
      }
      const pk = phoneKey(phone);
      const dupe = (pk && (existingPhones.has(pk) || seenPhones.has(pk))) || (email && (existingEmails.has(email) || seenEmails.has(email)));
      if (pk) seenPhones.add(pk);
      if (email) seenEmails.add(email);
      if (dupe) {
        dupes++;
        if (skipDupes) continue;
      }
      const temp = get(row, "temperature").toLowerCase();
      let score = parseInt(get(row, "leadScore"), 10);
      if (Number.isNaN(score)) score = /hot/.test(temp) ? 85 : /warm/.test(temp) ? 60 : /cold/.test(temp) ? 25 : 50;
      const pr = get(row, "priority");
      const priority: Priority = /high|urgent/i.test(pr) ? "HIGH" : /low/i.test(pr) ? "LOW" : "MEDIUM";
      const address = get(row, "address");
      const custom: Record<string, CustomFieldValue> = {};
      for (const f of customFields) {
        const raw = get(row, `cf:${f.key}`);
        if (!raw) continue;
        custom[f.key] = f.type === "NUMBER" ? Number(raw) || null : f.type === "BOOLEAN" ? /^(y|yes|true|1)$/i.test(raw) : raw;
      }
      const multiline = (s: string) => s.split(/\s*[;|\n]\s*/).filter(Boolean).join("\n");
      ready.push({
        businessName,
        phone,
        email,
        address,
        city: get(row, "city") || address.split(",").pop()?.trim() || "",
        website: get(row, "website").replace(/^https?:\/\//, ""),
        issues: multiline(get(row, "issues")),
        suggestedServices: multiline(get(row, "suggestedServices")),
        priority,
        source: get(row, "source") || "CSV Import",
        decisionMakerName: get(row, "decisionMakerName"),
        leadScore: Math.max(0, Math.min(100, score)),
        stage: "LEAD",
        service: parseService(get(row, "service") || get(row, "suggestedServices")),
        estimatedValue: Number(get(row, "estimatedValue").replace(/[^\d.]/g, "")) || 0,
        assignedToId: null,
        poolId: null,
        notes: get(row, "notes"),
        customFields: custom,
        lastContactedAt: null,
        nextFollowUpAt: null,
        closedAt: null,
      });
    }
    return { ready, dupes, errors };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mapping, rows, data.leads, skipDupes, customFields, mode]);

  const runImport = () => {
    if (!analysis) return;
    let poolId: string | null = poolChoice === "__none" ? null : poolChoice;
    if (poolChoice === "__new") {
      poolId = uid("pool");
      savePool({ id: poolId, name: newPool.trim() || fileName.replace(/\.csv$/i, ""), description: `Imported from ${fileName}` });
    }
    const assignees = strategy === "one" ? [oneRep] : strategy === "round" ? roundReps : [];
    const leads = analysis.ready.map((l, i) => ({
      ...l,
      poolId,
      assignedToId: assignees.length ? assignees[i % assignees.length] : null,
    }));
    importLeads(leads, {
      fileName,
      rowCount: rows.length,
      successCount: leads.length,
      duplicateCount: analysis.dupes,
      errorCount: analysis.errors,
      poolId,
    });
    setResult({ imported: leads.length, dupes: analysis.dupes, errors: analysis.errors, poolId });
    setStep("done");
  };

  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map columns" },
    { key: "review", label: "Review & assign" },
  ];
  const stepIndex = step === "done" ? 3 : steps.findIndex((s) => s.key === step);

  const footer =
    step === "map" ? (
      <>
        <Button variant="secondary" onClick={reset}>
          Back
        </Button>
        <Button disabled={missingRequired.length > 0} onClick={() => setStep("review")}>
          Continue
        </Button>
      </>
    ) : step === "review" ? (
      <>
        <Button variant="secondary" onClick={() => setStep("map")}>
          Back
        </Button>
        <Button
          disabled={!analysis?.ready.length || (strategy === "round" && !roundReps.length) || (poolChoice === "__new" && !newPool.trim() && !fileName)}
          onClick={runImport}
        >
          Import {analysis?.ready.length ?? 0} leads
        </Button>
      </>
    ) : step === "done" ? (
      <>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
        <Button
          onClick={() => {
            onImported?.(result?.poolId ?? null);
            close();
          }}
        >
          View imported leads
        </Button>
      </>
    ) : undefined;

  return (
    <Modal
      open={open}
      onClose={close}
      className="max-w-[860px]"
      title="Import leads from CSV"
      subtitle="Upload a spreadsheet export, match its columns to CRM fields, then choose who gets the leads."
      footer={footer}
    >
      {/* Stepper */}
      <div className="mb-8 flex items-center gap-3">
        {steps.map((s, i) => (
          <div key={s.key} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12.5px]",
                i < stepIndex ? "bg-brand text-brand-fg" : i === stepIndex ? "bg-ink text-white" : "bg-page text-neutral-500"
              )}
            >
              {i < stepIndex ? <Check className="h-4 w-4" strokeWidth={2.4} /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-[13px]", i === stepIndex ? "text-ink" : "text-neutral-500")}>{s.label}</span>
            {i < steps.length - 1 && <span className="h-px flex-1 bg-neutral-200" />}
          </div>
        ))}
      </div>

      {step === "upload" && (
        <div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-16 text-center transition-colors",
              dragOver ? "border-brand bg-brand-50" : "border-neutral-200 bg-soft hover:border-neutral-300"
            )}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-ink shadow-sm">
              <Upload className="h-6 w-6" strokeWidth={1.6} />
            </span>
            <span className="mt-5 text-[15px] font-medium">Drop your CSV here, or click to browse</span>
            <span className="mt-2 text-[13px] text-neutral-500">Exports from Google Sheets, Excel or scraping tools all work.</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {parseError && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-rose-600">
              <CircleAlert className="h-4 w-4" /> {parseError}
            </p>
          )}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-soft p-5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="h-5 w-5 text-neutral-600" strokeWidth={1.6} />
              <div>
                <p className="text-[13.5px] font-medium">Need a starting point?</p>
                <p className="text-[12.5px] text-neutral-500">The template includes every lead field and your custom fields.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" /> Download template
            </Button>
          </div>
        </div>
      )}

      {step === "map" && (
        <div>
          <p className="mb-5 text-[13.5px] text-neutral-600">
            <span className="text-ink">{fileName}</span> · {rows.length} rows · {headers.length} columns. We matched what we could — check the rest.
          </p>
          {missingRequired.length > 0 && (
            <p className="mb-5 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <CircleAlert className="h-4 w-4 shrink-0" />
              Map a column to {missingRequired.map((m) => m.label).join(" and ")} to continue.
            </p>
          )}
          <div className="overflow-hidden rounded-2xl border border-neutral-100">
            <div className="grid grid-cols-[1fr_1.2fr_1fr] gap-4 bg-soft px-5 py-3 text-[12px] text-neutral-500">
              <span>CSV column</span>
              <span>Sample values</span>
              <span>Maps to</span>
            </div>
            {headers.map((h) => (
              <div key={h} className="grid grid-cols-[1fr_1.2fr_1fr] items-center gap-4 border-t border-neutral-100 px-5 py-3.5">
                <span className="truncate text-[13.5px] font-medium">{h}</span>
                <span className="truncate text-[12.5px] text-neutral-500">
                  {rows
                    .slice(0, 3)
                    .map((r) => r[h])
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </span>
                <Select value={mapping[h]} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))}>
                  <option value="ignore">Don't import</option>
                  <optgroup label="Lead fields">
                    {CORE.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                        {requiredKeys.includes(c.key) ? " *" : ""}
                      </option>
                    ))}
                  </optgroup>
                  {customFields.length > 0 && (
                    <optgroup label="Custom fields">
                      {customFields.map((f) => (
                        <option key={f.id} value={`cf:${f.key}`}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === "review" && analysis && (
        <div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Summary label="Ready to import" value={analysis.ready.length} tone="ink" />
            <Summary label={skipDupes ? "Duplicates skipped" : "Duplicates (importing)"} value={analysis.dupes} />
            <Summary label={`Missing ${missingWhat}`} value={analysis.errors} />
          </div>
          <div className="mt-4">
            <Toggle checked={skipDupes} onChange={setSkipDupes} label="Skip leads whose phone or email already exists" />
          </div>

          <div className="mt-9 grid gap-6 sm:grid-cols-2">
            <Field label="Add to lead pool">
              <Select value={poolChoice} onChange={(e) => setPoolChoice(e.target.value)}>
                {data.pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="__new">+ New pool…</option>
                <option value="__none">No pool</option>
              </Select>
            </Field>
            {poolChoice === "__new" && (
              <Field label="New pool name">
                <Input value={newPool} onChange={(e) => setNewPool(e.target.value)} placeholder={fileName.replace(/\.csv$/i, "")} />
              </Field>
            )}
          </div>

          <p className="mb-3 mt-9 text-[13px] text-neutral-600">Who gets these leads?</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["pool", "Keep in pool", "Unassigned — reps or managers pick later"],
                ["one", "One rep", "Assign every lead to one person"],
                ["round", "Round-robin", "Spread evenly across selected reps"],
              ] as [Strategy, string, string][]
            ).map(([k, title, body]) => (
              <button
                key={k}
                type="button"
                onClick={() => setStrategy(k)}
                className={cn(
                  "rounded-2xl p-4 text-left transition-shadow",
                  strategy === k ? "bg-white shadow-[0_0_0_1.5px_rgb(var(--ink))]" : "bg-soft hover:shadow-[0_0_0_1px_rgba(10,10,10,0.1)]"
                )}
              >
                <p className="text-[14px] font-medium">{title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">{body}</p>
              </button>
            ))}
          </div>

          {strategy === "one" && (
            <Field label="Rep" className="mt-5 max-w-[320px]">
              <Select value={oneRep} onChange={(e) => setOneRep(e.target.value)}>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {strategy === "round" && (
            <div className="mt-5 flex flex-wrap gap-3">
              {reps.map((r) => {
                const on = roundReps.includes(r.id);
                return (
                  <label key={r.id} className={cn("flex cursor-pointer items-center gap-3 rounded-full py-1.5 pl-1.5 pr-4", on ? "bg-ink text-white" : "bg-page")}>
                    <Avatar name={r.name} size={28} />
                    <span className="text-[13px]">{r.name}</span>
                    <Checkbox checked={on} onChange={(v) => setRoundReps((list) => (v ? [...list, r.id] : list.filter((x) => x !== r.id)))} label={r.name} />
                  </label>
                );
              })}
            </div>
          )}

          {analysis.ready.length > 0 && (
            <div className="mt-9">
              <p className="mb-3 text-[13px] text-neutral-600">Preview</p>
              <div className="overflow-hidden rounded-2xl border border-neutral-100">
                {analysis.ready.slice(0, 4).map((l, i) => (
                  <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_0.6fr] gap-4 border-t border-neutral-100 px-5 py-3 text-[13px] first:border-0">
                    <span className="truncate font-medium">{l.businessName}</span>
                    <span className="truncate text-neutral-600">{l.phone}</span>
                    <span className="truncate text-neutral-600">{l.service}</span>
                    <span className="tabular-nums text-neutral-600">{l.leadScore}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === "done" && result && (
        <div className="flex flex-col items-center py-8 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand text-brand-fg">
            <Check className="h-7 w-7" strokeWidth={2.2} />
          </span>
          <p className="mt-6 text-[22px] font-medium tracking-[-0.01em]">{result.imported} leads imported</p>
          <p className="mt-2 text-[14px] text-neutral-500">
            {result.dupes} duplicate{result.dupes === 1 ? "" : "s"} {skipDupes ? "skipped" : "imported"} · {result.errors} row
            {result.errors === 1 ? "" : "s"} missing {missingWhat}
          </p>
        </div>
      )}
    </Modal>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: "ink" }) {
  return (
    <div className={cn("rounded-2xl p-5", tone === "ink" ? "bg-ink text-white" : "bg-soft")}>
      <p className={cn("text-[12.5px]", tone === "ink" ? "text-white/60" : "text-neutral-500")}>{label}</p>
      <p className="mt-3 text-[28px] font-normal leading-none tabular-nums">{value}</p>
    </div>
  );
}
