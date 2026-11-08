import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.NEXTAUTH_SECRET = "test-secret";
process.env.APP_URL = "https://crm.example.com";

import {
  checkAuthorizeRequest,
  decodeClient,
  isAllowedRedirectUri,
  isOurResource,
  redirectUriMatches,
  registerClient,
  verifyPkce,
} from "../src/server/outreach/oauth-core";

const client = registerClient({ client_name: "Agent", redirect_uris: ["https://app.example/cb", "http://127.0.0.1:3333/cb"] });
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const valid = { client_id: client.clientId, redirect_uri: "https://app.example/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz" };

test("registered client round-trips, tampering is rejected", () => {
  assert.equal(decodeClient(client.clientId)?.name, "Agent");
  const [head, sig] = client.clientId.split(".");
  assert.equal(decodeClient(`${head}A.${sig}`), null);
  assert.equal(decodeClient("nope"), null);
});

test("dangerous redirect URIs are refused", () => {
  for (const uri of ["javascript:alert(1)", "data:text/html,x", "http://evil.example/cb", "https://a.example/cb#frag", "https://u:p@a.example/cb"])
    assert.equal(isAllowedRedirectUri(uri), false, uri);
  for (const uri of ["https://a.example/cb", "http://localhost:9/cb", "http://[::1]:9/cb", "cursor://anysphere/cb"])
    assert.equal(isAllowedRedirectUri(uri), true, uri);
  assert.throws(() => registerClient({ redirect_uris: ["http://evil.example/cb"] }));
});

test("redirect match is exact except for the loopback port", () => {
  assert.equal(redirectUriMatches("http://127.0.0.1:1/cb", "http://127.0.0.1:2/cb"), true);
  assert.equal(redirectUriMatches("http://127.0.0.1:1/cb", "http://127.0.0.1:2/other"), false);
  assert.equal(redirectUriMatches("https://a.example:1/cb", "https://a.example:2/cb"), false);
});

test("PKCE accepts only the matching verifier", () => {
  assert.equal(verifyPkce(verifier, challenge), true);
  assert.equal(verifyPkce("b".repeat(43), challenge), false);
  assert.equal(verifyPkce("short", challenge), false);
  assert.equal(verifyPkce(undefined, challenge), false);
});

test("tokens can only target this MCP server", () => {
  assert.equal(isOurResource(undefined), true);
  assert.equal(isOurResource("https://crm.example.com/api/mcp"), true);
  assert.equal(isOurResource("https://other.example/api/mcp"), false);
});

test("authorize request checks", () => {
  assert.equal(checkAuthorizeRequest(valid).kind, "ok");
  assert.equal(checkAuthorizeRequest({ ...valid, client_id: "bad" }).kind, "fatal");
  assert.equal(checkAuthorizeRequest({ ...valid, redirect_uri: "https://evil.example/cb" }).kind, "fatal");
  for (const bad of [{ code_challenge_method: "plain" }, { code_challenge: undefined }, { response_type: "token" }, { scope: "admin" }, { resource: "https://other.example" }]) {
    const r = checkAuthorizeRequest({ ...valid, ...bad });
    assert.equal(r.kind, "redirect");
    if (r.kind === "redirect") assert.match(r.url, /^https:\/\/app\.example\/cb\?error=.*state=xyz/);
  }
});
