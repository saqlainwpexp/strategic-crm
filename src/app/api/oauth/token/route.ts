// OAuth 2.1 token endpoint: authorization_code (PKCE) and refresh_token grants.

import { OAuthError } from "@/server/outreach/oauth-core";
import { exchangeCode, refreshTokens } from "@/server/outreach/oauth";
import { oauthErrorResponse, oauthJson, oauthPreflight } from "@/server/outreach/oauth-http";

export const dynamic = "force-dynamic";
export const OPTIONS = oauthPreflight;

export async function POST(req: Request) {
  try {
    if (!(req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded"))
      throw new OAuthError("invalid_request", "Send the request as application/x-www-form-urlencoded.");
    const params = Object.fromEntries(new URLSearchParams(await req.text()));
    if (params.grant_type === "authorization_code") return oauthJson(await exchangeCode(params));
    if (params.grant_type === "refresh_token") return oauthJson(await refreshTokens(params));
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (e) {
    return oauthErrorResponse(e);
  }
}
