import { CampaignsView } from "@/components/linkedin/CampaignsView";
import { loadCampaigns, loadAccounts } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInCampaignsPage() {
  await requireLinkedInPage();
  const [campaigns, accounts] = await Promise.all([loadCampaigns(), loadAccounts()]);
  return <CampaignsView campaigns={campaigns} accounts={accounts} />;
}
