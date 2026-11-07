"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { LoadboardView } from "@/components/loadboard/LoadboardView";
import { Segmented } from "@/components/ui/Segmented";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { useCrm } from "@/components/providers/CrmProvider";
import { awaitingUs } from "@/lib/outreach/rules";
import { CLOSED_STAGES } from "@/lib/outreach/platforms";
import { SocialQueue } from "./SocialQueue";

/** Loadboard with a "Social" tab next to the calling queue (?tab=social). */
export function LoadboardTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const { viewer } = useCrm();
  const { data } = useOutreach();
  const tab = params.get("tab") === "social" ? "social" : "calls";
  const replies = data.threads.filter((t) => (viewer.role !== "SALES" || t.ownerId === viewer.id) && !CLOSED_STAGES.includes(t.stage) && awaitingUs(t)).length;

  return (
    <div>
      <div className="pt-6">
        <Segmented
          value={tab}
          onChange={(v) => router.replace(v === "social" ? "/loadboard?tab=social" : "/loadboard", { scroll: false })}
          options={[
            { value: "calls", label: "Calls" },
            { value: "social", label: "Social", count: replies || undefined },
          ]}
        />
      </div>
      {tab === "social" ? (
        <div className="pt-6">
          <SocialQueue focusLeadId={params.get("lead")} />
        </div>
      ) : (
        <LoadboardView />
      )}
    </div>
  );
}
