import { withAgency } from "@/server/db";
import { emailAgencyId, emailRecordId } from "@/server/email/tokens";
// Open-tracking pixel. Always returns the GIF; only a correctly signed token is counted.

import { getDb } from "@/server/db";
import { readOpenToken } from "@/server/email/tokens";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const reference = (await params).token;
  return withAgency(emailAgencyId(reference), async () => {
  const sendId = await readOpenToken((await params).token);
  if (sendId) {
    const now = new Date();
    await (await getDb()).emailSend
      .updateMany({ where: { id: sendId, openedAt: null }, data: { openedAt: now } })
      .then(async () => (await getDb()).emailSend.updateMany({ where: { id: sendId }, data: { openCount: { increment: 1 } } }))
      .catch(() => {});
  }
  return new Response(GIF, {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Content-Length": String(GIF.length) },
  });
  });
}
