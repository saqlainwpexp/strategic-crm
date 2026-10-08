import { AdminView } from "@/components/admin/AdminView";
import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { requirePageUser } from "@/server/session";

export default async function AdminPage() {
  if (!permissionsFor((await requirePageUser()).role).admin) return <AccessDenied what="Admin settings" />;
  return <AdminView />;
}
