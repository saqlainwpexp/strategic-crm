import { TeamView } from "@/components/team/TeamView";
import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { requirePageUser } from "@/server/session";

export default async function TeamPage() {
  if (!permissionsFor((await requirePageUser()).role).viewTeam) return <AccessDenied what="the Team page" />;
  return <TeamView />;
}
