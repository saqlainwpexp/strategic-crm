// RFC 8414 authorization server metadata.

import { issuer, SCOPE } from "@/server/outreach/oauth-core";
import { oauthJson, oauthPreflight } from "@/server/outreach/oauth-http";

export const dynamic = "force-dynamic";
export const OPTIONS = oauthPreflight;

export async function GET() {
  const base = issuer();
  return oauthJson({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  });
}
