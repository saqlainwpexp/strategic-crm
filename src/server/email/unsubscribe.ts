import { getDb } from "../db";

/** Opt a lead out of marketing email and stop any automations they're in. */
export async function unsubscribeLead(leadId: string) {
  const now = new Date();
  const res = await (await getDb()).lead.updateMany({ where: { id: leadId, emailOptOut: false }, data: { emailOptOut: true, unsubscribedAt: now } });
  await (await getDb()).automationEnrollment.updateMany({
    where: { leadId, status: "ACTIVE" },
    data: { status: "STOPPED", stopReason: "Unsubscribed", finishedAt: now, nextRunAt: null },
  });
  await (await getDb()).emailSend.updateMany({ where: { leadId, status: "QUEUED" }, data: { status: "SKIPPED", error: "Contact unsubscribed" } });
  return res.count > 0;
}
