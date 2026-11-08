// Access tokens for outreach agents (the MCP endpoint). A token acts as one CRM user, so the
// agent's sends count against that rep's daily limits and show up as their activity.
// Stored hashed in the Setting table ("outreach.agentTokens") — no migration needed.
// Format: scrm_<agencyId>.<secret>  (the agency id tells us which tenant to look in).

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb, withAgency } from "../db";
import { toUser } from "../mappers";
import type { User } from "@/lib/types";

const KEY = "outreach.agentTokens";

export type AgentToken = { id: string; name: string; userId: string; hash: string; hint: string; createdAt: string; createdById: string; lastUsedAt: string | null };
export type AgentTokenInfo = Omit<AgentToken, "hash">;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function readTokens(): Promise<AgentToken[]> {
  const row = await (await getDb()).setting.findFirst({ where: { key: KEY } });
  return Array.isArray(row?.value) ? (row!.value as unknown as AgentToken[]) : [];
}

async function writeTokens(tokens: AgentToken[]) {
  const d = await getDb();
  const value = tokens as unknown as object;
  if (await d.setting.findFirst({ where: { key: KEY } })) await d.setting.updateMany({ where: { key: KEY }, data: { value } });
  else await d.setting.create({ data: { key: KEY, value } });
}

const isManager = (u: User) => u.role === "MANAGER" || u.role === "SUPER_ADMIN";

export async function listAgentTokens(me: User): Promise<AgentTokenInfo[]> {
  if (!isManager(me)) return [];
  return (await readTokens()).map(({ hash: _h, ...t }) => t);
}

/** Returns the full token once; only its hash is kept. */
export async function createAgentToken(me: User, input: { name: string; userId: string }, agencyId: string) {
  if (!isManager(me)) throw new Error("Only managers and admins can create agent tokens.");
  const user = await (await getDb()).user.findUnique({ where: { id: input.userId } });
  if (!user?.active) throw new Error("Choose an active user for the agent to log as.");
  const secret = randomBytes(24).toString("base64url");
  const token = `scrm_${agencyId}.${secret}`;
  const tokens = await readTokens();
  if (tokens.length >= 50) throw new Error("Too many tokens — revoke some first.");
  const entry: AgentToken = {
    id: randomBytes(6).toString("hex"),
    name: input.name.trim().slice(0, 80) || "Outreach agent",
    userId: user.id,
    hash: sha(token),
    hint: `…${secret.slice(-4)}`,
    createdAt: new Date().toISOString(),
    createdById: me.id,
    lastUsedAt: null,
  };
  await writeTokens([...tokens, entry]);
  return { token, info: { ...entry, hash: undefined } };
}

export async function revokeAgentToken(me: User, id: string) {
  if (!isManager(me)) throw new Error("Only managers and admins can revoke agent tokens.");
  await writeTokens((await readTokens()).filter((t) => t.id !== id));
}

/**
 * Resolves a bearer token and runs `work` inside that agency as the token's user.
 * Returns null when the token is missing, malformed, revoked or the user is inactive.
 */
export async function withAgentToken<T>(bearer: string | null, work: (me: User, tokenName: string) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  const m = (bearer ?? "").match(/^Bearer\s+(scrm_([A-Za-z0-9_-]{1,64})\.[A-Za-z0-9_-]{20,})$/);
  if (!m) return { ok: false };
  const [, token, agencyId] = m;
  try {
    return await withAgency(agencyId, async () => {
      const tokens = await readTokens();
      const want = Buffer.from(sha(token), "hex");
      const hit = tokens.find((t) => {
        const have = Buffer.from(t.hash, "hex");
        return have.length === want.length && timingSafeEqual(have, want);
      });
      if (!hit) return { ok: false as const };
      const row = await (await getDb()).user.findUnique({ where: { id: hit.userId } });
      if (!row?.active) return { ok: false as const };
      // Note usage at most once an hour (cheap audit trail without a write per call).
      if (!hit.lastUsedAt || Date.now() - new Date(hit.lastUsedAt).getTime() > 3600_000) {
        hit.lastUsedAt = new Date().toISOString();
        await writeTokens(tokens).catch(() => undefined);
      }
      return { ok: true as const, value: await work(toUser(row), hit.name) };
    });
  } catch (e) {
    if (e instanceof Error && /Agency is unavailable/.test(e.message)) return { ok: false };
    throw e;
  }
}
