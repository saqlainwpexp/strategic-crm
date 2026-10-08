import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Record a security-relevant event. Never throws — auditing must not break the request. */
export async function audit(
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue
) {
  try {
    await prisma.auditLog.create({ data: { userId, action, entityType, entityId, meta } });
  } catch (e) {
    console.error("[audit] failed to write", action, e);
  }
}
