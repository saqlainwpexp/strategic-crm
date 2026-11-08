// Shared responses for the public OAuth endpoints. These carry no cookies, so open CORS is safe
// and lets browser-based MCP clients complete discovery and token exchange.

import { NextResponse } from "next/server";
import { OAuthError } from "./oauth-core";

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
};

export const oauthPreflight = async () => new NextResponse(null, { status: 204, headers: OAUTH_CORS });

export const oauthJson = (value: unknown) => NextResponse.json(value, { headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } });

export function oauthErrorResponse(e: unknown) {
  const known = e instanceof OAuthError;
  if (!known) console.error("[oauth]", e);
  return NextResponse.json(
    { error: known ? e.code : "server_error", error_description: known ? e.message : "Something went wrong. Try again shortly." },
    { status: known ? e.status : 500, headers: { ...OAUTH_CORS, "Cache-Control": "no-store" } }
  );
}
