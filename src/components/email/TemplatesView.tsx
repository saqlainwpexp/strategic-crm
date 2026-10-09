"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Copy, LayoutTemplate, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton, buttonClass } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { relativeTime } from "@/lib/date";
import { STARTER_TEMPLATES } from "@/lib/email-starters";
import type { EmailAccountView, TemplateView } from "@/lib/email-types";
import { deleteTemplateAction, duplicateTemplateAction, renameTemplateAction, saveTemplateAction } from "@/server/email/actions";
import { RenameModal, RowMenu } from "@/components/ui/RowMenu";
import { EmailEditor } from "./EmailEditor";
import { EmailPreview } from "./EmailPreview";
import { SendTestButton } from "./SendTestButton";
import { useEmailAction } from "./kit";

type Draft = { id?: string; name: string; subject: string; html: string };

export function TemplatesView({ templates, accounts }: { templates: TemplateView[]; accounts: EmailAccountView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [starterOpen, setStarterOpen] = useState(false);
  const [renaming, setRenaming] = useState<TemplateView | null>(null);

  useEffect(() => {
    if (params.get("new")) {
      setStarterOpen(true);
      router.replace(pathname, { scroll: false });
    }
  }, [params, pathname, router]);

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable emails for campaigns and automations."
        actions={
          <Button size="lg" onClick={() => setStarterOpen(true)}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />

      {templates.length === 0 ? (
        <Card>
          <EmptyState
            icon={LayoutTemplate}
            title="No templates yet"
            body="Start from one of our agency-ready cold emails, or write your own."
            action={<Button onClick={() => setStarterOpen(true)}>Choose a starting point</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col p-0">
              <button onClick={() => setDraft(t)} className="block overflow-hidden rounded-t-[20px] border-b border-neutral-100 text-left">
                <EmailPreview html={t.html} scale={0.5} height={420} className="pointer-events-none" />
              </button>
              <div className="flex flex-1 flex-col p-6">
                <button onClick={() => setDraft(t)} className="text-left">
                  <p className="truncate text-[16px] font-medium tracking-[-0.01em]">{t.name}</p>
                  <p className="mt-1.5 truncate text-[13px] text-neutral-500">{t.subject || "No subject"}</p>
                </button>
                <div className="mt-auto flex items-center gap-2 pt-5">
                  <span className="mr-auto text-[12px] text-neutral-400">Edited {relativeTime(t.updatedAt)}</span>
                  <Link href={`/email/campaigns/new?template=${t.id}`} className={buttonClass("ghost", "sm")}>
                    <Send className="h-3.5 w-3.5" /> Use
                  </Link>
                  <RowMenu
                    items={[
                      { icon: Pencil, label: "Rename", onClick: () => setRenaming(t) },
                      { icon: Copy, label: "Duplicate", onClick: () => run("dup", duplicateTemplateAction(t.id), "Template duplicated") },
                      {
                        icon: Trash2,
                        label: "Delete",
                        danger: true,
                        onClick: () =>
                          confirm({ title: `Delete “${t.name}”?`, body: "Campaigns and workflows already using it keep their own copy.", confirmLabel: "Delete", danger: true, run: () => run("del", deleteTemplateAction(t.id), "Template deleted") }),
                      },
                    ]}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <StarterPicker
        open={starterOpen}
        onClose={() => setStarterOpen(false)}
        onPick={(d) => {
          setStarterOpen(false);
          setDraft(d);
        }}
      />
      <TemplateEditor draft={draft} accounts={accounts} onClose={() => setDraft(null)} />
      {dialog}
      <RenameModal
        open={!!renaming}
        title="Rename template"
        initial={renaming?.name ?? ""}
        onClose={() => setRenaming(null)}
        onSave={(name) => run("rename", renameTemplateAction(renaming!.id, name), "Template renamed")}
      />
    </div>
  );
}

function StarterPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (d: Draft) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="New template" subtitle="Start blank or from a proven agency cold email." className="max-w-[720px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button onClick={() => onPick({ name: "Untitled template", subject: "", html: "" })} className="rounded-2xl border border-dashed border-neutral-300 p-5 text-left transition-colors hover:border-ink">
          <p className="text-[14.5px] font-medium">Blank</p>
          <p className="mt-1.5 text-[12.5px] text-neutral-500">Write from scratch</p>
        </button>
        {STARTER_TEMPLATES.map((s) => (
          <button key={s.name} onClick={() => onPick({ ...s })} className="rounded-2xl bg-soft p-5 text-left transition-colors hover:bg-page">
            <p className="text-[14.5px] font-medium">{s.name}</p>
            <p className="mt-1.5 truncate text-[12.5px] text-neutral-500">{s.subject}</p>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function TemplateEditor({ draft, accounts, onClose }: { draft: Draft | null; accounts: EmailAccountView[]; onClose: () => void }) {
  const { run, busy } = useEmailAction();
  const [d, setD] = useState<Draft>({ name: "", subject: "", html: "" });
  const [view, setView] = useState<"edit" | "preview">("edit");
  useEffect(() => {
    if (draft) {
      setD(draft);
      setView("edit");
    }
  }, [draft]);

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={d.id ? "Edit template" : "New template"}
      className="max-w-[920px]"
      footer={
        <>
          <SendTestButton accounts={accounts} subject={d.subject} html={d.html} />
          <span className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!d.name.trim() || busy === "save"}
            onClick={async () => {
              const res = await run("save", saveTemplateAction(d), "Template saved");
              if (res) onClose();
            }}
          >
            {busy === "save" ? "Saving…" : "Save template"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Template name" required>
            <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Subject line">
            <Input value={d.subject} placeholder="Quick idea for {{business_name}}" onChange={(e) => setD({ ...d, subject: e.target.value })} />
          </Field>
        </div>
        <Segmented
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "edit", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
        {view === "edit" ? (
          <EmailEditor value={d.html} onChange={(html) => setD((p) => ({ ...p, html }))} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/[0.08]">
            <EmailPreview html={d.html} height={460} />
          </div>
        )}
      </div>
    </Modal>
  );
}
