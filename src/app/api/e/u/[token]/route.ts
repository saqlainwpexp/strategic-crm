import { withAgency } from "@/server/db";
import { emailAgencyId, emailRecordId } from "@/server/email/tokens";
// One-click unsubscribe (RFC 8058), used by Gmail/Outlook's built-in "Unsubscribe" button.

import { unsubscribeLead } from "@/server/email/unsubscribe";
import { readUnsubscribeToken } from "@/server/email/tokens";

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const reference = (await params).token;
  return withAgency(emailAgencyId(reference), async () => {
  const leadId = await readUnsubscribeToken((await params).token);
  if (!leadId) return new Response("Invalid link", { status: 400 });
  await unsubscribeLead(leadId);
  return new Response("Unsubscribed", { status: 200 });
  });
}
