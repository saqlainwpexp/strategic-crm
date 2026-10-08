"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Lead } from "@/lib/types";
import { Input } from "@/components/ui/Form";
import { LeadThumb } from "@/components/ui/LeadThumb";

/** Searchable single-lead picker. */
export function LeadPicker({
  leads,
  value,
  onChange,
  placeholder = "Search business or owner…",
}: {
  leads: Lead[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const selected = value ? leads.find((l) => l.id === value) : undefined;

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? leads.filter(
          (l) => l.businessName.toLowerCase().includes(t) || l.decisionMakerName.toLowerCase().includes(t)
        )
      : leads;
    return list.slice(0, 6);
  }, [q, leads]);

  if (selected) {
    return (
      <div className="flex h-14 items-center gap-3 rounded-xl border border-black/[0.08] bg-white px-3">
        <LeadThumb lead={selected} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">{selected.businessName}</p>
          <p className="truncate text-[12px] text-neutral-500">{selected.decisionMakerName}</p>
        </div>
        <button
          type="button"
          aria-label="Clear"
          onClick={() => onChange(null)}
          className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 hover:bg-page hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-10 rounded-2xl bg-white p-2 shadow-[0_16px_48px_-8px_rgba(10,10,10,0.2),0_0_0_1px_rgba(10,10,10,0.06)]">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-neutral-500">No leads found.</p>
          ) : (
            matches.map((l) => (
              <button
                type="button"
                key={l.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(l.id);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-page"
              >
                <LeadThumb lead={l} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px]">{l.businessName}</span>
                  <span className="block truncate text-[11.5px] text-neutral-500">{l.decisionMakerName}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
