import { withAgency } from "@/server/db";
import { emailAgencyId, emailRecordId } from "@/server/email/tokens";
// Click tracking: records the click, then forwards to the original link. The link is signed, so
// this can't be used to redirect people to arbitrary sites.

import { getDb } from "@/server/db";
import { appUrl } from "@/server/email/crypto";
import { verifyClick } from "@/server/email/tokens";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const reference = (await params).id;
  return withAgency(emailAgencyId(reference), async () => {
  const id = emailRecordId(reference);
  const url = new URL(req.url);
  const dest = url.searchParams.get("u") ?? "";
  const sig = url.searchParams.get("s") ?? "";
  if (!/^https?:\/\//i.test(dest) || !(await verifyClick(id, dest, sig))) return Response.redirect(await appUrl(), 302);

  const now = new Date();
  await (await getDb()).emailSend
    .updateMany({ where: { id, clickedAt: null }, data: { clickedAt: now } })
    .then(async () => (await getDb()).emailSend.updateMany({ where: { id }, data: { clickCount: { increment: 1 } } }))
    // A click proves an open even when images were blocked.
    .then(async () => (await getDb()).emailSend.updateMany({ where: { id, openedAt: null }, data: { openedAt: now, openCount: 1 } }))
    .catch(() => {});
  return Response.redirect(dest, 302);
  });
}
