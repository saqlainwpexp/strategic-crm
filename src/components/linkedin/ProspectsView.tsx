"use client";

import { useState, useTransition, useRef } from "react";
import { Edit2, Plus, Search, Trash2, Upload, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { upsertProspect, deleteProspect, importProspects, enrollProspects } from "@/server/linkedin/actions";
import type { LiProspect } from "@prisma/client";

const BLANK = { linkedinUrl: "", firstName: "", lastName: "", title: "", company: "", location: "", notes: "" };

export function ProspectsView({ prospects: initial, campaigns }: { prospects: LiProspect[]; campaigns: { id: string; name: string }[] }) {
  const [prospects, setProspects] = useState(initial);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LiProspect | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = prospects.filter((p) => {
    const q = search.toLowerCase();
    return !q || p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) || p.company.toLowerCase().includes(q) || p.title.toLowerCase().includes(q);
  });

  const handleEnroll = (campaignId: string) => {
    if (!campaignId) return;
    const name = campaigns.find((c) => c.id === campaignId)?.name;
    if (!confirm(`Add ${filtered.length} prospect(s) to "${name}"?`)) return;
    startTransition(async () => {
      try {
        const res = await enrollProspects(campaignId, filtered.map((p) => p.id));
        alert(`${res.added} added to the campaign, ${res.skipped} were already in it.`);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Could not add prospects");
      }
    });
  };

  const handleSave = (form: typeof BLANK & { id?: string }) => {
    startTransition(async () => {
      await upsertProspect(form);
      window.location.reload();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this prospect?")) return;
    startTransition(async () => {
      await deleteProspect(id);
      setProspects((prev) => prev.filter((p) => p.id !== id));
    });
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.trim().split("\n");
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
        const row: Record<string, string> = {};
        header.forEach((h, i) => { row[h] = cols[i] ?? ""; });
        return {
          linkedinUrl: row.linkedinurl || row.linkedin_url || row.url || "",
          firstName: row.firstname || row.first_name || "",
          lastName: row.lastname || row.last_name || "",
          title: row.title || row.jobtitle || row.job_title || "",
          company: row.company || row.organization || "",
          location: row.location || "",
        };
      }).filter((r) => r.linkedinUrl.includes("linkedin.com"));
      setImporting(true);
      startTransition(async () => {
        const result = await importProspects(rows);
        setImportResult(result);
        setImporting(false);
        window.location.reload();
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div>
      <PageHeader
        title="Prospects"
        subtitle={`${prospects.length.toLocaleString()} LinkedIn profiles imported`}
        actions={
          <div className="flex items-center gap-3">
            {campaigns.length > 0 && filtered.length > 0 && (
              <select value="" disabled={pending} onChange={(e) => handleEnroll(e.target.value)} className="h-10 rounded-xl border border-black/[0.08] bg-white px-3 text-[13.5px] outline-none">
                <option value="">Add {search ? "filtered" : "all"} to campaign…</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" strokeWidth={1.8} />
              Import CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileImport} />
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Add prospect
            </Button>
          </div>
        }
      />

      {importResult && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-[14px] text-emerald-800">
            Import complete: <strong>{importResult.imported}</strong> added, <strong>{importResult.skipped}</strong> skipped (duplicates)
          </p>
          <button onClick={() => setImportResult(null)} className="text-emerald-600 hover:text-emerald-800">✕</button>
        </div>
      )}

      {/* CSV format hint */}
      <div className="mb-6 rounded-2xl border border-black/[0.06] bg-page p-4 text-[13px] text-neutral-500">
        <p className="font-medium text-neutral-700">CSV columns (case-insensitive):</p>
        <p className="mt-1 font-mono text-[12px]">linkedinUrl, firstName, lastName, title, company, location</p>
      </div>

      {/* Search */}
      <label className="mb-4 flex h-11 items-center gap-3 rounded-2xl border border-black/[0.06] bg-white px-4">
        <Search className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.8} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, title or company…" className="flex-1 bg-transparent text-[14px] outline-none" />
      </label>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 py-20 text-center">
          <Users className="mx-auto h-10 w-10 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-4 text-[15px] text-neutral-500">{search ? "No prospects match your search" : "No prospects yet"}</p>
          {!search && <p className="mt-1 text-[13px] text-neutral-400">Import a CSV or add prospects one by one</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-100">
                {["Name", "Title", "Company", "Location", "Source", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-neutral-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-page">
                  <td className="px-4 py-3">
                    <p className="text-[14px] font-medium">{[p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}</p>
                    <a href={p.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#0A66C2] hover:underline truncate block max-w-[200px]">
                      {p.linkedinUrl.replace("https://www.linkedin.com/in/", "")}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[13px] text-neutral-600">{p.title || "—"}</td>
                  <td className="px-4 py-3 text-[13px] text-neutral-600">{p.company || "—"}</td>
                  <td className="px-4 py-3 text-[13px] text-neutral-500">{p.location || "—"}</td>
                  <td className="px-4 py-3 text-[12px] text-neutral-400 capitalize">{p.source}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-page" title="Edit">
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="grid h-8 w-8 place-items-center rounded-full text-rose-400 hover:bg-rose-50" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length < prospects.length && (
            <p className="border-t border-neutral-100 px-4 py-3 text-center text-[13px] text-neutral-400">
              Showing {filtered.length} of {prospects.length} prospects
            </p>
          )}
        </div>
      )}

      {editing !== null && (
        <ProspectModal
          prospect={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={pending}
        />
      )}
    </div>
  );
}

function ProspectModal({ prospect, onClose, onSave, saving }: { prospect: LiProspect | null; onClose: () => void; onSave: (d: typeof BLANK & { id?: string }) => void; saving: boolean }) {
  const [form, setForm] = useState(prospect ? { ...BLANK, ...prospect, notes: prospect.notes ?? "" } : BLANK);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-[18px] font-semibold">{prospect ? "Edit prospect" : "Add prospect"}</h2>
        <div className="space-y-3">
          <Field label="LinkedIn URL *"><input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} placeholder="https://www.linkedin.com/in/…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name"><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
            <Field label="Last name"><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          </div>
          <Field label="Job title"><input value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Company"><input value={form.company} onChange={(e) => set("company", e.target.value)} /></Field>
          <Field label="Location"><input value={form.location} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...(prospect ? { id: prospect.id } : {}), ...form })} disabled={!form.linkedinUrl || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-neutral-700">{label}</span>
      <div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-black/[0.08] [&_input]:bg-page [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:text-[14px] [&_input]:outline-none [&_input]:focus:border-ink [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-black/[0.08] [&_textarea]:bg-page [&_textarea]:px-3.5 [&_textarea]:py-2.5 [&_textarea]:text-[14px] [&_textarea]:outline-none">
        {children}
      </div>
    </label>
  );
}
