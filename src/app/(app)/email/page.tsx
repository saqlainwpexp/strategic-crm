import { EmailDashboard } from "@/components/email/EmailDashboard";
import { loadOverview } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function EmailHomePage() {
  await requireEmailPage();
  return <EmailDashboard data={await loadOverview()} />;
}
