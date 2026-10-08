import { AdminView } from "@/components/admin/AdminView";
import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { getViewer } from "@/lib/viewer";

export default function AdminPage() {
  if (!permissionsFor(getViewer().role).admin) return <AccessDenied what="Admin settings" />;
  return <AdminView />;
}
