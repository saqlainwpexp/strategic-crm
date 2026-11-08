// RFC 9728 metadata: tells MCP clients which authorization server protects /api/mcp.

import { issuer, mcpResource, SCOPE } from "@/server/outreach/oauth-core";
import { oauthJson, oauthPreflight } from "@/server/outreach/oauth-http";

export const dynamic = "force-dynamic";
export const OPTIONS = oauthPreflight;

export async function GET() {
  return oauthJson({
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  });
}
