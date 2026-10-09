// "Send to sales calls": the bridge from email outreach to the calling team.
// The lead becomes Interested, gets a rep, and is due for a call right now — so it
// appears at the top of that rep's Loadboard queue.

import { prisma } from "../db";
import { fireTrigger } from "./triggers";

const EARLY_STAGES = new Set(["LEAD", "CONTACTED", "CALL_ME_LATER", "NO_SHOW", "HUNG_UP"]);

/** The active sales rep (or BD if there are no reps) with the fewest hand-offs this week. */
export async function nextRep(candidates?: string[]): Promise<string | null> {
  const users = await prisma.user.findMany({
    where: { active: true, ...(candidates?.length ? { id: { in: candidates } } : { role: "SALES" }) },
    select: { id: true },
  });
  const pool = users.length ? users : await prisma.user.findMany({ where: { active: true, role: "BD" }, select: { id: true } });
  if (!pool.length) return null;
  const since = new Date(Date.now() - 7 * 86_400_000);
  const load = await prisma.lead.groupBy({
    by: ["assignedToId"],
    where: { assignedToId: { in: pool.map((u) => u.id) }, handedOffAt: { gte: since } },
    _count: { _all: true },
  });
  const count = new Map(load.map((l) => [l.assignedToId, l._count._all]));
  return [...pool].sort((a, b) => (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0))[0].id;
}

export async function handOffToCalls(leadId: string, opts: { repId?: string | null; note?: string } = {}) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, stage: true, assignedToId: true, notes: true } });
  if (!lead) return null;
  const now = new Date();
  const assignee = opts.repId ?? lead.assignedToId ?? (await nextRep());
  const note = `${now.toISOString().slice(0, 10)} · ${opts.note ?? "Replied to email outreach — call them."}`;
  const moveStage = EARLY_STAGES.has(lead.stage);
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      assignedToId: assignee,
      handedOffAt: now,
      nextFollowUpAt: now,
      ...(moveStage ? { stage: "INTERESTED" } : {}),
      notes: lead.notes ? `${note}\n${lead.notes}`.slice(0, 8000) : note,
    },
  });
  if (moveStage) await fireTrigger("STAGE_CHANGED", [leadId], "INTERESTED");
  return { assignedToId: assignee };
}
