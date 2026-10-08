// Server-only: reads request cookies.
import { cookies } from "next/headers";
import { getSeed } from "./data/seed";
import type { User } from "./types";

/**
 * Cookie holding the "Preview as" user. Temporary: replaced by the NextAuth session
 * once login is wired to the database.
 */
export const VIEW_AS_COOKIE = "scrm_view_as";

export function getViewer(): User {
  const id = cookies().get(VIEW_AS_COOKIE)?.value;
  const { users } = getSeed();
  return users.find((u) => u.id === id) ?? users.find((u) => u.role === "MANAGER")!;
}
