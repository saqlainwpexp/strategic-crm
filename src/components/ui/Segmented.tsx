import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: React.ReactNode; count?: number };

/** Pill tab group — same look as the main nav (black active pill). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-page p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full transition-colors",
              size === "sm" ? "h-8 px-3.5 text-[12.5px]" : "h-9 px-4 text-[13px]",
              active ? "bg-ink text-white" : "text-neutral-600 hover:text-ink"
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px] tabular-nums",
                  active ? "bg-white/15 text-white" : "bg-white text-neutral-500"
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
