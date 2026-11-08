// OAuth 2.1 rules for the MCP endpoint that need no database, so they can be unit-tested.
// Clients are public (no secret) and always use PKCE S256. A client_id is a signed copy of the
// client's registration, so anonymous dynamic registration never writes to the database.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { publicUrl } from "../agencies";

export const CODE_TTL_S = 120;
export const ACCESS_TTL_S = 60 * 60;
export const REFRESH_TTL_S = 30 * 24 * 60 * 60;
export const SCOPE = "mcp";

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export const issuer = () => publicUrl();
export const mcpResource = () => `${publicUrl()}/api/mcp`;

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function signingKey() {
  const key = process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("NEXTAUTH_SECRET is not set");
  return createHmac("sha256", key).update("strategic-crm.oauth-client.v1").digest();
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const BLOCKED_SCHEMES = new Set(["javascript:", "data:", "vbscript:", "file:", "about:", "blob:", "ftp:", "ws:", "wss:"]);

/** https, http on loopback only, or a native app's private scheme. No fragments. */
export function isAllowedRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 500) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (raw.includes("#") || url.username || url.password || BLOCKED_SCHEMES.has(url.protocol)) return false;
  return url.protocol !== "http:" || LOOPBACK.has(url.hostname);
}

/** Exact match, except that a loopback redirect may use any port (OAuth 2.1 §8.4.2). */
export function redirectUriMatches(registered: string, requested: string) {
  if (registered === requested) return true;
  try {
    const a = new URL(registered);
    const b = new URL(requested);
    if (a.protocol !== "http:" || b.protocol !== "http:" || !LOOPBACK.has(a.hostname)) return false;
    a.port = "";
    b.port = "";
    return a.toString() === b.toString();
  } catch {
    return false;
  }
}

export type OAuthClient = { name: string; redirectUris: string[] };

export function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = input.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > 5 || !uris.every(isAllowedRedirectUri))
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1-5 https, loopback http or private-scheme URIs without fragments.");
  const rawName = typeof input.client_name === "string" ? input.client_name : "";
  const name = rawName.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80) || "MCP client";
  const payload = Buffer.from(JSON.stringify({ n: name, r: uris })).toString("base64url");
  return { clientId: `scrmcl_${payload}.${sign(payload)}`, name, redirectUris: uris as string[] };
}

export function decodeClient(clientId: unknown): OAuthClient | null {
  if (typeof clientId !== "string" || clientId.length > 4096) return null;
  const m = clientId.match(/^scrmcl_([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m || !safeEqual(sign(m[1]), m[2])) return null;
  try {
    const { n, r } = JSON.parse(Buffer.from(m[1], "base64url").toString());
    return { name: n, redirectUris: r };
  } catch {
    return null;
  }
}

export const verifyPkce = (verifier: unknown, challenge: string) =>
  typeof verifier === "string" &&
  /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) &&
  safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);

/** RFC 8707: this server issues tokens for its own MCP endpoint and nothing else. */
export function isOurResource(resource: unknown) {
  if (resource === undefined || resource === null || resource === "") return true;
  return typeof resource === "string" && resource.replace(/\/+$/, "") === mcpResource();
}

export function isGrantedScope(scope: unknown) {
  if (scope === undefined || scope === null || scope === "") return true;
  return typeof scope === "string" && scope.split(/\s+/).filter(Boolean).every((s) => s === SCOPE || s === "offline_access");
}

export function withQuery(uri: string, params: Record<string, string | undefined>) {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

export type AuthorizeRequest = { clientId: string; client: OAuthClient; redirectUri: string; challenge: string; state?: string };
export type AuthorizeCheck = { kind: "ok"; request: AuthorizeRequest } | { kind: "fatal"; message: string } | { kind: "redirect"; url: string };

/** Until client and redirect_uri are proven good, errors must never redirect anywhere. */
export function checkAuthorizeRequest(p: Record<string, unknown>): AuthorizeCheck {
  const client = decodeClient(p.client_id);
  if (!client) return { kind: "fatal", message: "This app isn't registered correctly (unknown client_id)." };
  const redirectUri = p.redirect_uri;
  if (typeof redirectUri !== "string" || !client.redirectUris.some((r) => redirectUriMatches(r, redirectUri)))
    return { kind: "fatal", message: "This app asked to return to an address it didn't register (redirect_uri mismatch)." };
  const state = typeof p.state === "string" ? p.state : undefined;
  const fail = (error: string, description: string): AuthorizeCheck => ({
    kind: "redirect",
    url: withQuery(redirectUri, { error, error_description: description, state, iss: issuer() }),
  });
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (p.code_challenge_method !== "S256" || typeof p.code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(p.code_challenge))
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  if (!isGrantedScope(p.scope)) return fail("invalid_scope", `Only the "${SCOPE}" scope is available.`);
  if (!isOurResource(p.resource)) return fail("invalid_target", "Tokens can only be issued for this MCP server.");
  return { kind: "ok", request: { clientId: p.client_id as string, client, redirectUri, challenge: p.code_challenge, state } };
}
