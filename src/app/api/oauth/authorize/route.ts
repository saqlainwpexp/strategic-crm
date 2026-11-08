// Receives the decision from the consent page and tells it where to send the browser.
// Answers with JSON instead of a redirect because the site's CSP (form-action 'self') would block
// a form redirecting to the client's callback. JSON-only plus the Origin check stops cross-site posts.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/server/session";
import { publicUrl } from "@/server/agencies";
import { OAuthError, checkAuthorizeRequest, issuer, withQuery } from "@/server/outreach/oauth-core";
import { issueCode } from "@/server/outreach/oauth";

export const dynamic = "force-dynamic";

const Body = z.object({
  params: z.record(z.string(), z.string()),
  decision: z.enum(["approve", "deny"]),
  userId: z.string().max(64).optional(),
});

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(publicUrl()).origin) return NextResponse.json({ error: "Request blocked." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Your session has ended. Sign in again." }, { status: 401 });

  const { params, decision, userId } = parsed.data;
  const check = checkAuthorizeRequest(params);
  if (check.kind === "fatal") return NextResponse.json({ error: check.message }, { status: 400 });
  if (check.kind === "redirect") return NextResponse.json({ redirect: check.url });
  const { redirectUri, state } = check.request;
  if (decision === "deny")
    return NextResponse.json({ redirect: withQuery(redirectUri, { error: "access_denied", error_description: "The request was declined.", state, iss: issuer() }) });
  try {
    const code = await issueCode(me, check.request, userId ?? "");
    return NextResponse.json({ redirect: withQuery(redirectUri, { code, state, iss: issuer() }) });
  } catch (e) {
    if (e instanceof OAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[oauth] authorize", e);
    return NextResponse.json({ error: "Couldn't approve that. Try again shortly." }, { status: 500 });
  }
}
