import { redirect } from "next/navigation";
import { permissionsFor } from "@/lib/access";
import { HOME_PATH } from "@/lib/nav";
import { requirePageUser } from "../session";

export async function requireLinkedInPage() {
  const me = await requirePageUser();
  if (!permissionsFor(me.role).linkedIn) redirect(HOME_PATH);
  return me;
}
