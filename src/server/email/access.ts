import { redirect } from "next/navigation";
import { permissionsFor } from "@/lib/access";
import { HOME_PATH } from "@/lib/nav";
import { requirePageUser } from "../session";

/** For email pages: the signed-in manager/super admin, or a redirect home. */
export async function requireEmailPage() {
  const me = await requirePageUser();
  if (!permissionsFor(me.role).emailMarketing) redirect(HOME_PATH);
  return me;
}
