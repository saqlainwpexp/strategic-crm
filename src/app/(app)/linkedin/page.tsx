import { LinkedInDashboard } from "@/components/linkedin/LinkedInDashboard";
import { loadLinkedInOverview } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInPage() {
  await requireLinkedInPage();
  return <LinkedInDashboard data={await loadLinkedInOverview()} />;
}
