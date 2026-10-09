import { CampaignsView } from "@/components/email/CampaignsView";
import { loadCampaigns } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function CampaignsPage() {
  await requireEmailPage();
  return <CampaignsView campaigns={await loadCampaigns()} />;
}
