"use client";

import { useState, useTransition } from "react";
import { Edit2, LayoutTemplate, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { upsertTemplate, deleteTemplate } from "@/server/linkedin/actions";
import type { LiTemplate } from "@prisma/client";

const VARS = ["{firstName}", "{lastName}", "{company}", "{title}"];

export function TemplatesView({ templates: initial }: { templates: LiTemplate[] }) {
  const [templates, setTemplates] = useState(initial);
  const [editing, setEditing] = useState<LiTemplate | "new" | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = (data: { id?: string; name: string; body: string }) => {
    startTransition(async () => {
      await upsertTemplate(data);
      window.location.reload();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this template?")) return;
    startTransition(async () => {
      await deleteTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    });
  };

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable message text with {firstName}, {company} placeholders"
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            New template
          </Button>
        }
      />

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 py-20 text-center">
          <LayoutTemplate className="mx-auto h-10 w-10 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-4 text-[15px] text-neutral-500">No templates yet</p>
          <p className="mt-1 text-[13px] text-neutral-400">Create reusable messages with personalisation variables</p>
          <Button className="mt-6" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />New template</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col rounded-2xl border border-black/[0.06] bg-white p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <p className="text-[15px] font-semibold">{t.name}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setEditing(t)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-page" title="Edit">
                    <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="grid h-8 w-8 place-items-center rounded-full text-rose-400 hover:bg-rose-50" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              <div className="flex-1 rounded-xl bg-page px-4 py-3">
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-neutral-700">{t.body}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {VARS.filter((v) => t.body.includes(v)).map((v) => (
                  <span key={v} className="rounded-full bg-blue-50 px-2 py-0.5 font-mono text-[11px] text-blue-700">{v}</span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] text-neutral-400">Updated {new Date(t.updatedAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <TemplateModal
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          saving={pending}
        />
      )}
    </div>
  );
}

function TemplateModal({ template, onClose, onSave, saving }: { template: LiTemplate | null; onClose: () => void; onSave: (d: { id?: string; name: string; body: string }) => void; saving: boolean }) {
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const textRef = (el: HTMLTextAreaElement | null) => el;

  const insertVar = (v: string) => {
    setBody((b) => b + v);
  };

  const charCount = body.length;
  const isLong = charCount > 300;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-[18px] font-semibold">{template ? "Edit template" : "New template"}</h2>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium">Template name *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Initial connection note" className="w-full rounded-xl border border-black/[0.08] bg-page px-3.5 py-2.5 text-[14px] outline-none focus:border-ink" />
          </label>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium">Message body *</span>
              <span className={`text-[12px] ${isLong ? "text-amber-600" : "text-neutral-400"}`}>{charCount} chars{isLong ? " — keep it short" : ""}</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              placeholder={`Hi {firstName},\n\nI came across your profile and noticed you work at {company}…`}
              className="w-full rounded-xl border border-black/[0.08] bg-page px-3.5 py-2.5 text-[14px] leading-relaxed outline-none focus:border-ink"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-[12px] text-neutral-500">Insert variable:</span>
              {VARS.map((v) => (
                <button key={v} onClick={() => insertVar(v)} className="rounded-full bg-blue-50 px-2.5 py-0.5 font-mono text-[11.5px] text-blue-700 hover:bg-blue-100">
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...(template ? { id: template.id } : {}), name, body })} disabled={!name || !body || saving}>
            {saving ? "Saving…" : "Save template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
