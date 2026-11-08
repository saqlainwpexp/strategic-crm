// RFC 7591 dynamic client registration. Public clients only; see registerClient for why it's stateless.

import { NextResponse } from "next/server";
import { OAuthError, registerClient } from "@/server/outreach/oauth-core";
import { OAUTH_CORS, oauthErrorResponse, oauthPreflight } from "@/server/outreach/oauth-http";

export const dynamic = "force-dynamic";
export const OPTIONS = oauthPreflight;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new OAuthError("invalid_client_metadata", "Send client metadata as JSON.");
    const client = registerClient(body);
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: client.name,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
      { status: 201, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
