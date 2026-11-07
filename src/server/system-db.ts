import { PrismaClient } from "@prisma/client";
// Privileged access is restricted to authentication, signup, workers and scoped reports.
const g = globalThis as unknown as { systemPrisma?: PrismaClient };
const url = new URL(process.env.DATABASE_URL || "mysql://localhost/crm");
if (!url.searchParams.has("connect_timeout")) url.searchParams.set("connect_timeout", "20");
export const systemDb = g.systemPrisma ??= new PrismaClient({ datasources: { db: { url: url.toString() } }, log: ["error"] });
