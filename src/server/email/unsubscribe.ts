import { prisma } from "../db";

/** Opt a lead out of marketing email and stop any automations they're in. */
export async function unsubscribeLead(leadId: string) {
  const now = new Date();
  const res = await prisma.lead.updateMany({ where: { id: leadId, emailOptOut: false }, data: { emailOptOut: true, unsubscribedAt: now } });
  await prisma.automationEnrollment.updateMany({
    where: { leadId, status: "ACTIVE" },
    data: { status: "STOPPED", stopReason: "Unsubscribed", finishedAt: now, nextRunAt: null },
  });
  await prisma.emailSend.updateMany({ where: { leadId, status: "QUEUED" }, data: { status: "SKIPPED", error: "Contact unsubscribed" } });
  return res.count > 0;
}
