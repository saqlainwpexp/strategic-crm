import type { Prisma } from "@prisma/client";
import { getDb } from "./db";

/** Record a security-relevant event. Never throws — auditing must not break the request. */
export async function audit(
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: Prisma.InputJsonValue
) {
  try {
    await (await getDb()).auditLog.create({ data: { userId, action, entityType, entityId, meta } });
  } catch (e) {
    console.error("[audit] failed to write", action, e);
  }
}
