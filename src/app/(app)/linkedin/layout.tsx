import { AccessDenied } from "@/components/ui/Layout";
import { permissionsFor } from "@/lib/access";
import { requirePageUser } from "@/server/session";

export default async function LinkedInLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageUser();
  if (!permissionsFor(viewer.role).linkedIn) return <AccessDenied what="Strategic LinkedIn" />;
  return children;
}
