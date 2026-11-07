// Receives your LinkedIn session from the Strategic CRM browser extension, so the local
// worker can act as you without a separate login. Needs a signed-in CRM user with LinkedIn access.

import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { permissionsFor } from "@/lib/access";
import { encryptSecret } from "@/server/email/crypto";

export const dynamic = "force-dynamic";

type Cookie = { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; expirationDate?: number; sameSite?: string };

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || !permissionsFor(me.role).linkedIn) return Response.json({ error: "Sign in to the CRM in this browser first." }, { status: 401 });
  // JSON only: a plain cross-site form post can't reach this.
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Bad request" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { cookies?: Cookie[]; userAgent?: string } | null;
  const cookies = (body?.cookies ?? []).filter((c) => c && typeof c.name === "string" && typeof c.value === "string" && /linkedin\.com$/.test(c.domain));
  if (!cookies.some((c) => c.name === "li_at")) return Response.json({ error: "Not signed in to LinkedIn in this browser." }, { status: 400 });

  // One LinkedIn account per CRM (your own); create it on first sync.
  const account =
    (await (await getDb()).liAccount.findFirst({ orderBy: { createdAt: "asc" } })) ??
    (await (await getDb()).liAccount.create({ data: { name: "My LinkedIn" } }));
  await (await getDb()).liAccount.update({
    where: { id: account.id },
    data: {
      sessionEnc: encryptSecret(JSON.stringify(cookies)),
      sessionUserAgent: (body?.userAgent ?? "").slice(0, 500),
      sessionSyncedAt: new Date(),
      lastError: null,
      ...(account.status === "PAUSED" && account.lastError ? { status: "WARMING" } : {}),
    },
  });
  return Response.json({ ok: true, account: account.name });
}
