import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { requirePageUser } from "@/server/session";

// Email marketing is for managers and the super admin. Every action re-checks this too.
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageUser();
  if (!permissionsFor(viewer.role).emailMarketing) return <AccessDenied what="Email Marketing" />;
  return children;
}
