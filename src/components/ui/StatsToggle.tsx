"use client";

import { useCallback, useEffect, useState } from "react";
import { ChartColumn, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Open/closed flag remembered per browser (defaults to closed). */
export function useRememberedToggle(key: string) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(key) === "1");
    } catch {
      /* storage unavailable */
    }
  }, [key]);
  const toggle = useCallback(() => {
    setOpen((o) => {
      try {
        localStorage.setItem(key, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  }, [key]);
  return [open, toggle] as const;
}

/** Header pill that shows/hides a page's stat cards. */
export function StatsToggle({ open, onToggle, label = "Stats" }: { open: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "inline-flex h-12 items-center gap-2.5 rounded-full border px-5 text-[14px] transition-colors",
        open ? "border-ink bg-ink text-white" : "border-black/[0.06] bg-white text-ink hover:bg-neutral-50"
      )}
    >
      <ChartColumn className="h-4 w-4" strokeWidth={1.8} />
      {label}
      <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
    </button>
  );
}
