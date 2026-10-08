import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRIORITY_COLOR,
  PRIORITY_LABELS,
  STAGE_DOT,
  STAGE_LABELS,
  TEMP_COLOR,
  TEMP_LABELS,
  type PipelineStage,
  type Priority,
  type Temperature,
} from "@/lib/constants";

/** Small square dot + label — the status style from the reference table. */
export function StatusDot({ color, label, className }: { color: string; label: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-[13px] text-ink", className)}>
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function StageLabel({ stage, className }: { stage: PipelineStage; className?: string }) {
  return <StatusDot color={STAGE_DOT[stage]} label={STAGE_LABELS[stage]} className={className} />;
}

/** "82 Hot" — score followed by a coloured temperature word. */
export function ScoreTag({ score, temp }: { score: number; temp: Temperature }) {
  return (
    <span className="whitespace-nowrap tabular-nums text-ink">
      {score}
      <span className="ml-1.5 text-[11.5px]" style={{ color: TEMP_COLOR[temp] }}>
        {TEMP_LABELS[temp]}
      </span>
    </span>
  );
}

/** Tinted pill for temperature. */
export function TempPill({ temp, score }: { temp: Temperature; score?: number }) {
  const color = TEMP_COLOR[temp];
  return (
    <span
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium"
      style={{ background: `${color}14`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {TEMP_LABELS[temp]}
      {score !== undefined && <span className="tabular-nums opacity-80">· {score}</span>}
    </span>
  );
}

export function PriorityFlag({ priority, className }: { priority: Priority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-neutral-700", className)}>
      <Flag className="h-3 w-3" strokeWidth={2} style={{ color: PRIORITY_COLOR[priority] }} />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

/** Green/red change badge, as on the dashboard KPI column. */
export function Delta({ value, className }: { value: string; className?: string }) {
  const negative = value.trim().startsWith("-");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-[11px] font-medium tabular-nums",
        negative ? "bg-rose-50 text-rose-600" : "bg-[#E9F8EE] text-[#1F9D4C]",
        className
      )}
    >
      {value}
    </span>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-7 items-center rounded-full bg-page px-3 text-[12px] text-neutral-700", className)}>
      {children}
    </span>
  );
}
