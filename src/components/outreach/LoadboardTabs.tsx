"use client";

import { LoadboardView } from "@/components/loadboard/LoadboardView";

/**
 * The cold-calling loadboard. Social DM outreach moved to the Outreach & Jobs Log (/log),
 * so there is no Social tab here any more.
 */
export function LoadboardTabs() {
  return <LoadboardView />;
}
