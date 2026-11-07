import { ProspectsView } from "@/components/linkedin/ProspectsView";
import { loadCampaigns, loadProspects } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInProspectsPage() {
  await requireLinkedInPage();
  const [prospects, campaigns] = await Promise.all([loadProspects(), loadCampaigns()]);
  return <ProspectsView prospects={prospects} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />;
}
