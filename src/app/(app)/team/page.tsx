import { TeamView } from "@/components/team/TeamView";
import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { getViewer } from "@/lib/viewer";

export default function TeamPage() {
  if (!permissionsFor(getViewer().role).viewTeam) return <AccessDenied what="the Team page" />;
  return <TeamView />;
}
