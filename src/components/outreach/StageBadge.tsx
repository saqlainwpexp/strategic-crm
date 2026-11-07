import { STAGE_COLOR, STAGE_LABEL, type OutreachStage } from "@/lib/outreach/platforms";

export function StageBadge({ stage }: { stage: OutreachStage }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-page px-2.5 py-0.5 text-[11.5px] text-neutral-700">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STAGE_COLOR[stage] }} />
      {STAGE_LABEL[stage]}
    </span>
  );
}
