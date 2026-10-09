"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickOption = { value: string; label: string; hint?: string };

/** Pill that opens a searchable checklist. Active (non-empty) pills turn black like FilterSelect. */
export function MultiPick({
  label,
  options,
  value,
  onChange,
  allowCustom,
  className,
}: {
  label: string;
  options: PickOption[];
  value: string[];
  onChange: (v: string[]) => void;
  /** Let people type a value that isn't in the list (e.g. a new tag). */
  allowCustom?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
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

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
  }, [q, options]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const active = value.length > 0;
  const summary = active
    ? value.length === 1
      ? options.find((o) => o.value === value[0])?.label ?? value[0]
      : `${label} · ${value.length}`
    : label;
  const custom = allowCustom && q.trim() && !options.some((o) => o.value.toLowerCase() === q.trim().toLowerCase()) ? q.trim() : null;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex h-10 max-w-[260px] items-center gap-2 rounded-full border pl-4 pr-3 text-[13px] transition",
          active ? "border-ink bg-ink text-white" : "border-transparent bg-page text-ink hover:bg-neutral-200/70"
        )}
      >
        <span className="truncate">{summary}</span>
        {active ? (
          <X
            className="h-3.5 w-3.5 shrink-0 opacity-80 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}
      </button>
      {open && (
        <div className="animate-pop-in absolute left-0 top-[calc(100%+8px)] z-30 w-[280px] rounded-2xl bg-white p-2 shadow-[0_24px_64px_-12px_rgba(10,10,10,0.25),0_0_0_1px_rgba(10,10,10,0.05)]">
          {(options.length > 7 || allowCustom) && (
            <label className="mb-1 flex h-10 items-center gap-2 rounded-xl bg-page px-3">
              <Search className="h-3.5 w-3.5 text-neutral-500" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && custom) {
                    onChange([...value, custom]);
                    setQ("");
                  }
                }}
                placeholder={allowCustom ? "Search or add…" : "Search…"}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-neutral-500"
              />
            </label>
          )}
          <div className="scroll-slim max-h-[260px] overflow-y-auto">
            {custom && (
              <button type="button" onClick={() => { onChange([...value, custom]); setQ(""); }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-page">
                Add “{custom}”
              </button>
            )}
            {shown.length === 0 && !custom && <p className="px-3 py-4 text-[13px] text-neutral-500">Nothing to choose yet.</p>}
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] hover:bg-page"
                >
                  <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border", on ? "border-ink bg-ink text-white" : "border-neutral-300")}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-[11.5px] text-neutral-400">{o.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
