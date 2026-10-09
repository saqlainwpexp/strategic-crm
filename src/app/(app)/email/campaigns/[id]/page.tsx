import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CampaignEditor } from "@/components/email/CampaignEditor";
import { CampaignReport } from "@/components/email/CampaignReport";
import { loadAccounts, loadAudienceOptions, loadCampaign, loadRecipients, loadTemplates } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEmailPage();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const campaign = await loadCampaign(id);
  if (!campaign) notFound();

  if (campaign.status === "DRAFT" || campaign.status === "SCHEDULED") {
    const [accounts, templates, options] = await Promise.all([loadAccounts(), loadTemplates(), loadAudienceOptions()]);
    return (
      <Suspense>
        <CampaignEditor key={campaign.id} campaign={campaign} accounts={accounts} templates={templates} options={options} />
      </Suspense>
    );
  }
  const [recipients, accounts] = await Promise.all([loadRecipients({ campaignId: id }, 2000), loadAccounts()]);
  return <CampaignReport campaign={campaign} recipients={recipients} accounts={accounts} />;
}
