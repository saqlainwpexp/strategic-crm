// Enrols leads into active automations when something happens in the CRM.
// Never throws: a failing automation must not break saving a lead.

import { prisma } from "../db";
import type { AutomationTrigger } from "@/lib/email";

export async function enrollLeads(automationId: string, leadIds: string[]) {
  if (!leadIds.length) return 0;
  const res = await prisma.automationEnrollment.createMany({
    data: leadIds.map((leadId) => ({ automationId, leadId, nextRunAt: new Date() })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function fireTrigger(trigger: Exclude<AutomationTrigger, "MANUAL">, leadIds: string[], value = "") {
  if (!leadIds.length) return;
  try {
    const autos = await prisma.automation.findMany({
      where: { status: "ACTIVE", trigger, ...(trigger === "LEAD_CREATED" ? {} : { triggerValue: value }) },
      select: { id: true },
    });
    for (const a of autos) await enrollLeads(a.id, leadIds);
  } catch (e) {
    console.error(`[email] trigger ${trigger} failed`, e);
  }
}
