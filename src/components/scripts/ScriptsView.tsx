"use client";

import { useMemo, useRef, useState } from "react";
import { FileText, Pencil, Plus } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { Field, Input, SearchInput, Select, Textarea, Toggle } from "@/components/ui/Form";
import { Chip } from "@/components/ui/Badges";
import { LeadPicker } from "@/components/shared/LeadPicker";
import { SCRIPT_VARIABLES, ScriptText, scriptVars } from "./ScriptText";
import type { Script } from "@/lib/types";
import { formatDateYear } from "@/lib/date";
import { cn, formatDuration, pct, sum } from "@/lib/utils";

const CATEGORIES = ["Web Design", "Graphic Design", "GHL", "General", "Objections"];
type Draft = { id?: string; title: string; category: string; body: string; active: boolean };

export function ScriptsView() {
  const { data, perms, viewer, saveScript, userById } = useCrm();
  const { branding } = useBranding();
  const [tab, setTab] = useState<"active" | "retired">("active");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(data.scripts.find((s) => s.active)?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const usage = useMemo(() => {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const recent = data.calls.filter((c) => c.startedAt >= since && c.scriptId);
    return new Map(
      data.scripts.map((s) => {
        const used = recent.filter((c) => c.scriptId === s.id);
        const meetings = used.filter((c) => c.disposition === "MEETING_BOOKED").length;
        return [
          s.id,
          {
            calls: used.length,
            meetings,
            interested: used.filter((c) => c.disposition === "INTERESTED").length,
            avgTalk: used.length ? Math.round(sum(used.map((c) => c.durationSec)) / used.length) : 0,
            rate: pct(meetings, used.length, 1),
          },
        ];
      })
    );
  }, [data.calls, data.scripts]);

  const list = data.scripts
    .filter((s) => (tab === "active" ? s.active : !s.active))
    .filter((s) => !q.trim() || `${s.title} ${s.category} ${s.body}`.toLowerCase().includes(q.trim().toLowerCase()));
  const selected = data.scripts.find((s) => s.id === selectedId);
  const lead = previewLead ? data.leads.find((l) => l.id === previewLead) : undefined;
  const stats = selected ? usage.get(selected.id) : undefined;

  const startEdit = (s?: Script) => setDraft(s ? { id: s.id, title: s.title, category: s.category, body: s.body, active: s.active } : { title: "", category: "Web Design", body: "OPENER\n\n\nVALUE\n\n\nCLOSE\n", active: true });

  const insertVar = (v: string) => {
    if (!draft) return;
    const el = bodyRef.current;
    const token = `{${v}}`;
    if (!el) return setDraft({ ...draft, body: draft.body + token });
    const { selectionStart: a, selectionEnd: b } = el;
    const body = draft.body.slice(0, a) + token + draft.body.slice(b);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const save = () => {
    if (!draft || !draft.title.trim() || !draft.body.trim()) return;
    saveScript({ ...draft, title: draft.title.trim() });
    setDraft(null);
    if (!draft.id) setTab(draft.active ? "active" : "retired");
  };

  return (
    <div>
      <PageHeader
        title="Call Scripts"
        subtitle="Talk tracks for every service. Placeholders fill in automatically during a call."
        actions={
          perms.editScripts && (
            <Button size="lg" onClick={() => startEdit()}>
              <Plus className="h-4 w-4" /> New script
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit p-6">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scripts" className="h-11" />
          <Segmented
            className="mt-4"
            value={tab}
            onChange={setTab}
            options={[
              { value: "active", label: "Active", count: data.scripts.filter((s) => s.active).length },
              { value: "retired", label: "Retired", count: data.scripts.filter((s) => !s.active).length },
            ]}
          />
          <div className="mt-5 flex flex-col gap-2">
            {list.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-neutral-500">No scripts here.</p>}
            {list.map((s) => {
              const u = usage.get(s.id);
              const active = s.id === selectedId && !draft;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setDraft(null);
                    setSelectedId(s.id);
                  }}
                  className={cn("rounded-2xl p-4 text-left transition-colors", active ? "bg-ink text-white" : "bg-soft hover:bg-neutral-100")}
                >
                  <p className="text-[14px] font-medium">{s.title}</p>
                  <p className={cn("mt-1.5 text-[12px]", active ? "text-white/60" : "text-neutral-500")}>
                    {s.category} · {u?.calls ?? 0} calls · {u?.rate ?? 0}% to meeting
                  </p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-8">
          {draft ? (
            <div>
              <h2 className="text-[22px] font-medium tracking-[-0.015em]">{draft.id ? "Edit script" : "New script"}</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_220px]">
                <Field label="Title" required>
                  <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. GHL — Review Automation Pitch" />
                </Field>
                <Field label="Category">
                  <Select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-6">
                <p className="mb-2 text-[13px] text-neutral-600">Insert placeholder</p>
                <div className="flex flex-wrap gap-2">
                  {SCRIPT_VARIABLES.map((v) => (
                    <button key={v} onClick={() => insertVar(v)} className="h-8 rounded-full bg-page px-3 font-mono text-[12px] text-neutral-700 hover:bg-ink hover:text-white">
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Script" hint="Lines in ALL CAPS become section headings." className="mt-6">
                <Textarea ref={bodyRef} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="min-h-[380px]" />
              </Field>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                <Toggle checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} label={draft.active ? "Active — reps can use it" : "Retired — hidden from calls"} />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={!draft.title.trim() || !draft.body.trim()}>
                    Save script
                  </Button>
                </div>
              </div>
            </div>
          ) : selected ? (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-[24px] font-medium tracking-[-0.015em]">{selected.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Chip>{selected.category}</Chip>
                    <Chip className={selected.active ? "bg-[#E9F8EE] text-[#1F9D4C]" : ""}>{selected.active ? "Active" : "Retired"}</Chip>
                    <span className="text-[12.5px] text-neutral-500">
                      Updated {formatDateYear(selected.updatedAt)} by {userById(selected.createdById)?.name ?? "—"}
                    </span>
                  </div>
                </div>
                {perms.editScripts && (
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => saveScript({ ...selected, active: !selected.active })}>
                      {selected.active ? "Retire" : "Restore"}
                    </Button>
                    <Button onClick={() => startEdit(selected)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Calls · 30 days" value={stats?.calls ?? 0} />
                <Stat label="Avg talk time" value={stats?.calls ? formatDuration(stats.avgTalk) : "—"} />
                <Stat label="Interested" value={stats?.interested ?? 0} />
                <Stat label="Meeting rate" value={`${stats?.rate ?? 0}%`} />
              </div>

              <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
                <p className="text-[13px] font-medium">Script</p>
                <div className="w-full sm:w-[320px]">
                  <LeadPicker leads={data.leads} value={previewLead} onChange={setPreviewLead} placeholder="Preview with a lead…" />
                </div>
              </div>
              <div className="mt-4 rounded-[20px] bg-soft p-7">
                <ScriptText body={selected.body} vars={lead ? scriptVars(lead, viewer, branding.agencyName) : undefined} />
              </div>
            </div>
          ) : (
            <EmptyState icon={FileText} title="Pick a script" body="Choose a script on the left to read it or preview it with a lead." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-5 py-4">
      <p className="text-[12px] text-neutral-500">{label}</p>
      <p className="mt-2 text-[22px] tabular-nums leading-none">{value}</p>
    </div>
  );
}
