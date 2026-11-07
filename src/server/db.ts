import { headers, cookies } from "next/headers";
import { getToken } from "next-auth/jwt";
import { agencyContext, publicUrl } from "./agencies";
import { systemDb } from "./system-db";
import { tenantClient } from "./tenant-client";
export async function agencyById(id: string) {
  const row = await systemDb.agency.findUnique({ where: { id } });
  if (!row?.active) throw new Error("Agency is unavailable");
  return { id: row.id, name: row.name, url: publicUrl() };
}
export async function withAgency<T>(id: string, work: () => Promise<T>): Promise<T> {
  return agencyContext.run(await agencyById(id), work);
}
export async function getAgency() {
  const context = agencyContext.getStore();
  if (context) return context;
  const h = await headers();
  const token = await getToken({ req: { cookies: await cookies(), headers: { cookie: h.get("cookie") || "" } } as any, secret: process.env.NEXTAUTH_SECRET });
  if (token?.uid) return agencyById(typeof token.agencyId === "string" ? token.agencyId : "default");
  throw new Error("Please sign in");
}
export async function getDb() { return tenantClient(systemDb, (await getAgency()).id); }
