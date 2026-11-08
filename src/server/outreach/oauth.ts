// OAuth 2.1 grants for the MCP endpoint. Like agent tokens, a grant acts as one CRM user and only
// managers can create one. Everything is hashed, in the agency's Setting rows (no migration).
// Codes and refresh tokens get a row each, so deleting that row is an atomic single-use check.

import { randomBytes } from "node:crypto";
import { getAgency, getDb, withAgency } from "../db";
import { toUser } from "../mappers";
import type { User } from "@/lib/types";
import { ACCESS_TTL_S, CODE_TTL_S, OAuthError, REFRESH_TTL_S, SCOPE, decodeClient, isGrantedScope, isOurResource, redirectUriMatches, secret, sha, verifyPkce, type AuthorizeRequest } from "./oauth-core";

const CODE = "oauth.code.";
const GRANT = "oauth.grant.";
const REFRESH = "oauth.refresh.";
const MAX_GRANTS = 100;

type CodeRow = { clientHash: string; clientName: string; redirectUri: string; challenge: string; userId: string; expiresAt: number };
type GrantRow = { id: string; clientHash: string; clientName: string; userId: string; accessHash: string; accessExpiresAt: number; refreshExpiresAt: number; createdAt: string; lastUsedAt: string | null };
export type OAuthGrantInfo = { id: string; clientName: string; userId: string; createdAt: string; lastUsedAt: string | null };

const isManager = (u: User) => u.role === "MANAGER" || u.role === "SUPER_ADMIN";
const invalidGrant = () => new OAuthError("invalid_grant", "This authorization is invalid or has expired.");
const badTarget = () => new OAuthError("invalid_target", "Tokens can only be issued for this MCP server.");

async function getRow<T>(key: string) {
  const row = await (await getDb()).setting.findFirst({ where: { key } });
  return row ? (row.value as unknown as T) : null;
}
async function putRow(key: string, value: object) {
  await (await getDb()).setting.create({ data: { key, value } });
}
async function updateRow(key: string, value: object) {
  await (await getDb()).setting.updateMany({ where: { key }, data: { value } });
}
async function takeRow(key: string) {
  return (await (await getDb()).setting.deleteMany({ where: { key } })).count === 1;
}

async function dropGrant(id: string) {
  const d = await getDb();
  await d.setting.deleteMany({ where: { key: { startsWith: `${REFRESH}${id}.` } } });
  await d.setting.deleteMany({ where: { key: `${GRANT}${id}` } });
}

async function grantRows() {
  const rows = await (await getDb()).setting.findMany({ where: { key: { startsWith: GRANT } } });
  return rows.map((r) => r.value as unknown as GrantRow);
}

async function sweepExpired(now: number) {
  const d = await getDb();
  for (const row of await d.setting.findMany({ where: { key: { startsWith: CODE } } }))
    if ((row.value as unknown as CodeRow).expiresAt < now) await d.setting.deleteMany({ where: { key: row.key } });
  for (const grant of await grantRows()) if (grant.refreshExpiresAt < now) await dropGrant(grant.id);
}

/** Called after a signed-in manager approves. Returns the one-time authorization code. */
export async function issueCode(me: User, request: AuthorizeRequest, userId: string) {
  if (!isManager(me)) throw new OAuthError("access_denied", "Only managers and admins can connect agents.", 403);
  const target = await (await getDb()).user.findUnique({ where: { id: userId } });
  if (!target?.active) throw new OAuthError("invalid_request", "Choose an active user for the agent to log as.");
  const now = Date.now();
  await sweepExpired(now);
  if ((await grantRows()).length >= MAX_GRANTS) throw new OAuthError("temporarily_unavailable", "Too many connected apps. Disconnect some first.", 409);
  const code = `scrmc_${(await getAgency()).id}.${secret()}`;
  const row: CodeRow = {
    clientHash: sha(request.clientId),
    clientName: request.client.name,
    redirectUri: request.redirectUri,
    challenge: request.challenge,
    userId,
    expiresAt: now + CODE_TTL_S * 1000,
  };
  await putRow(`${CODE}${sha(code)}`, row);
  return code;
}

function tokenResponse(accessToken: string, refreshToken: string) {
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refreshToken, scope: SCOPE };
}

async function mintTokens(agencyId: string, grantId: string) {
  const access = `scrmo_${agencyId}.${grantId}.${secret()}`;
  const refresh = `scrmr_${agencyId}.${grantId}.${secret()}`;
  await putRow(`${REFRESH}${grantId}.${sha(refresh)}`, { expiresAt: Date.now() + REFRESH_TTL_S * 1000 });
  return { access, refresh };
}

async function activeUser(id: string) {
  const row = await (await getDb()).user.findUnique({ where: { id } });
  return row?.active ? row : null;
}

async function inAgency<T>(agencyId: string, work: () => Promise<T>) {
  try {
    return await withAgency(agencyId, work);
  } catch (e) {
    if (e instanceof Error && /Agency is unavailable/.test(e.message)) throw invalidGrant();
    throw e;
  }
}

function checkClient(clientId: unknown) {
  if (!decodeClient(clientId)) throw new OAuthError("invalid_client", "Unknown client_id.", 401);
  return sha(clientId as string);
}

export async function exchangeCode(p: Record<string, string | undefined>) {
  const clientHash = checkClient(p.client_id);
  if (!isOurResource(p.resource)) throw badTarget();
  const m = (p.code ?? "").match(/^scrmc_([A-Za-z0-9_-]{1,64})\.[A-Za-z0-9_-]{20,}$/);
  if (!m) throw invalidGrant();
  const agencyId = m[1];
  return inAgency(agencyId, async () => {
    const key = `${CODE}${sha(p.code!)}`;
    const code = await getRow<CodeRow>(key);
    // Consumed before it's checked: a wrong guess at the verifier burns the code.
    if (!code || !(await takeRow(key))) throw invalidGrant();
    if (
      code.expiresAt < Date.now() ||
      code.clientHash !== clientHash ||
      !p.redirect_uri ||
      !redirectUriMatches(code.redirectUri, p.redirect_uri) ||
      !verifyPkce(p.code_verifier, code.challenge)
    )
      throw invalidGrant();
    if (!(await activeUser(code.userId))) throw invalidGrant();
    const id = randomBytes(6).toString("hex");
    const { access, refresh } = await mintTokens(agencyId, id);
    const now = Date.now();
    const grant: GrantRow = {
      id,
      clientHash,
      clientName: code.clientName,
      userId: code.userId,
      accessHash: sha(access),
      accessExpiresAt: now + ACCESS_TTL_S * 1000,
      refreshExpiresAt: now + REFRESH_TTL_S * 1000,
      createdAt: new Date(now).toISOString(),
      lastUsedAt: null,
    };
    await putRow(`${GRANT}${id}`, grant);
    return tokenResponse(access, refresh);
  });
}

export async function refreshTokens(p: Record<string, string | undefined>) {
  const clientHash = checkClient(p.client_id);
  if (!isOurResource(p.resource)) throw badTarget();
  if (!isGrantedScope(p.scope)) throw new OAuthError("invalid_scope", `Only the "${SCOPE}" scope is available.`);
  const m = (p.refresh_token ?? "").match(/^scrmr_([A-Za-z0-9_-]{1,64})\.([a-f0-9]{12})\.[A-Za-z0-9_-]{20,}$/);
  if (!m) throw invalidGrant();
  const [, agencyId, id] = m;
  return inAgency(agencyId, async () => {
    const grant = await getRow<GrantRow>(`${GRANT}${id}`);
    if (!grant || grant.clientHash !== clientHash) throw invalidGrant();
    const key = `${REFRESH}${id}.${sha(p.refresh_token!)}`;
    const stored = await getRow<{ expiresAt: number }>(key);
    // Refresh tokens are single-use: replaying a spent one means it leaked, so end the whole grant.
    if (!stored || !(await takeRow(key)) || stored.expiresAt < Date.now() || !(await activeUser(grant.userId))) {
      await dropGrant(id);
      throw invalidGrant();
    }
    const { access, refresh } = await mintTokens(agencyId, id);
    const now = Date.now();
    await updateRow(`${GRANT}${id}`, { ...grant, accessHash: sha(access), accessExpiresAt: now + ACCESS_TTL_S * 1000, refreshExpiresAt: now + REFRESH_TTL_S * 1000 });
    return tokenResponse(access, refresh);
  });
}

const OAUTH_BEARER = /^Bearer\s+(scrmo_([A-Za-z0-9_-]{1,64})\.([a-f0-9]{12})\.[A-Za-z0-9_-]{20,})$/;
export const isOAuthBearer = (header: string | null) => /^Bearer\s+scrmo_/.test(header ?? "");

/** Same contract as withAgentToken, for access tokens issued by the OAuth flow. */
export async function withOAuthToken<T>(bearer: string | null, work: (me: User, tokenName: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  const m = (bearer ?? "").match(OAUTH_BEARER);
  if (!m) return { ok: false };
  const [, token, agencyId, id] = m;
  try {
    return await withAgency(agencyId, async () => {
      const grant = await getRow<GrantRow>(`${GRANT}${id}`);
      if (!grant || grant.accessExpiresAt < Date.now() || grant.accessHash !== sha(token)) return { ok: false as const };
      const row = await activeUser(grant.userId);
      if (!row) return { ok: false as const };
      if (!grant.lastUsedAt || Date.now() - new Date(grant.lastUsedAt).getTime() > 3600_000)
        await updateRow(`${GRANT}${id}`, { ...grant, lastUsedAt: new Date().toISOString() }).catch(() => undefined);
      return { ok: true as const, value: await work(toUser(row), grant.clientName) };
    });
  } catch (e) {
    if (e instanceof Error && /Agency is unavailable/.test(e.message)) return { ok: false };
    throw e;
  }
}

export async function listOAuthGrants(me: User): Promise<OAuthGrantInfo[]> {
  if (!isManager(me)) return [];
  const now = Date.now();
  return (await grantRows())
    .filter((g) => g.refreshExpiresAt >= now)
    .map(({ id, clientName, userId, createdAt, lastUsedAt }) => ({ id, clientName, userId, createdAt, lastUsedAt }));
}

export async function revokeOAuthGrant(me: User, id: string) {
  if (!isManager(me)) throw new Error("Only managers and admins can disconnect apps.");
  await dropGrant(id);
}
