"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Field, Input } from "./Form";
import { Modal } from "./Overlay";

export type RowMenuItem = { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean; hidden?: boolean };

/** "⋯" button with a small dropdown of actions (rename, duplicate, delete…). */
export function RowMenu({ items, label = "More actions", className }: { items: RowMenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("grid h-9 w-9 place-items-center rounded-full transition-colors", open ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200/80")}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="animate-pop-in absolute right-0 top-[calc(100%+8px)] z-30 w-[200px] rounded-2xl bg-white p-1.5 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.25),0_0_0_1px_rgba(10,10,10,0.05)]">
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  i.onClick();
                }}
                className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px]", i.danger ? "text-rose-600 hover:bg-rose-50" : "text-ink hover:bg-page")}
              >
                <i.icon className="h-4 w-4" strokeWidth={1.8} />
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Small dialog to give something a new name. */
export function RenameModal({
  open,
  title,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: string;
  onClose: () => void;
  onSave: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim());
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-[460px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name.trim() || name.trim() === initial}>
            {busy ? "Saving…" : "Save name"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </Field>
    </Modal>
  );
}
