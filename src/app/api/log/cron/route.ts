// Wakes the Outreach & Jobs log: marks cold contacts/jobs and sends due follow-ups to the
// agent webhook. The app also does this every 5 minutes on its own; this is for Hostinger cron.
//   curl -fsS "https://your-crm/api/log/cron?key=YOUR_CRON_SECRET"

import crypto from "crypto";
import { runLogTick } from "@/server/outreach-log/worker";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const ok = secret.length >= 16 && key.length === secret.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(secret));
  if (!ok) return new Response("Not found", { status: 404 });
  return Response.json({ ok: true, agencies: await runLogTick() });
}
