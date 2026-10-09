// Optional: lets a Hostinger cron job wake the email engine if the app was idle.
//   curl -fsS "https://your-crm/api/e/cron?key=YOUR_CRON_SECRET"
// Disabled unless CRON_SECRET is set.

import crypto from "crypto";
import { runEmailTick } from "@/server/email/worker";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const ok = secret.length >= 16 && key.length === secret.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });
  const result = await runEmailTick({ imap: true });
  return Response.json({ ok: true, ...result });
}
