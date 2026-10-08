// Who is making this request. Every page and server action goes through here.

import { cache } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { prisma } from "./db";
import { toUser } from "./mappers";
import type { User } from "@/lib/types";

/**
 * The signed-in user, re-read from the database on every request so that deactivation,
 * role changes and password changes take effect immediately. Null when signed out.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || !user.active) return null;
  // Password changed since this session was issued → treat as signed out.
  if ((user.passwordChangedAt?.getTime() ?? 0) !== (session.user.pv ?? 0)) return null;
  return toUser(user);
});

/** For pages: the user, or a redirect to the sign-in screen. */
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class AuthError extends Error {}

/** For server actions: the user, or an error the client shows as "please sign in again". */
export async function requireActionUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Your session has ended — please sign in again.");
  return user;
}

/** Ids of users whose work `viewer` can see; null = everyone (manager / super admin). */
export async function visibleUserIds(viewer: User): Promise<Set<string> | null> {
  if (viewer.role === "SALES") return new Set([viewer.id]);
  if (viewer.role === "BD") {
    const reports = await prisma.user.findMany({ where: { reportsToId: viewer.id }, select: { id: true } });
    return new Set([viewer.id, ...reports.map((r) => r.id)]);
  }
  return null;
}
