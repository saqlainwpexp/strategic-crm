// Turns a campaign's AudienceFilter into the list of leads that will receive it.

import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getSettings } from "../settings";
import type { AudienceFilter } from "@/lib/email";
import type { PipelineStage } from "@/lib/constants";

/** Leads that can receive marketing email at all. */
export const MAILABLE: Prisma.LeadWhereInput = {
  email: { not: null, contains: "@" },
  emailOptOut: false,
  emailBouncedAt: null,
};

export async function audienceWhere(a: AudienceFilter): Promise<Prisma.LeadWhereInput> {
  if (a.leadIds.length) return { AND: [MAILABLE, { id: { in: a.leadIds } }] };

  const and: Prisma.LeadWhereInput[] = [MAILABLE];
  if (a.stages.length) and.push({ stage: { in: a.stages as PipelineStage[] } });
  if (a.services.length) and.push({ service: { in: a.services } });
  if (a.poolIds.length) and.push({ poolId: { in: a.poolIds } });
  if (a.sources.length) and.push({ source: { in: a.sources } });
  if (a.cities.length) and.push({ city: { in: a.cities } });
  if (a.assignedToIds.length) and.push({ assignedToId: { in: a.assignedToIds } });
  if (a.tags.length) and.push({ OR: a.tags.map((t) => ({ tags: { array_contains: [t] } })) });
  if (a.temperatures.length && a.temperatures.length < 3) {
    const s = await getSettings();
    const ranges: Prisma.LeadWhereInput[] = a.temperatures.map((t) =>
      t === "HOT"
        ? { leadScore: { gte: s.hotThreshold } }
        : t === "WARM"
          ? { leadScore: { gte: s.warmThreshold, lt: s.hotThreshold } }
          : { leadScore: { lt: s.warmThreshold } }
    );
    and.push({ OR: ranges });
  }
  if (a.excludeEmailedWithinDays > 0) {
    const cutoff = new Date(Date.now() - a.excludeEmailedWithinDays * 86_400_000);
    and.push({ OR: [{ lastEmailedAt: null }, { lastEmailedAt: { lt: cutoff } }] });
  }
  return { AND: and };
}

/** Matching leads, one per email address (the first one wins). */
export async function resolveAudience(a: AudienceFilter) {
  const leads = await prisma.lead.findMany({
    where: await audienceWhere(a),
    select: { id: true, email: true },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const seen = new Set<string>();
  return leads.filter((l) => {
    const e = (l.email ?? "").trim().toLowerCase();
    if (!e || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}
