import { Suspense } from "react";
import { CampaignEditor } from "@/components/email/CampaignEditor";
import { loadAccounts, loadAudienceOptions, loadTemplates } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function NewCampaignPage() {
  await requireEmailPage();
  const [accounts, templates, options] = await Promise.all([loadAccounts(), loadTemplates(), loadAudienceOptions()]);
  return (
    <Suspense>
      <CampaignEditor campaign={null} accounts={accounts} templates={templates} options={options} />
    </Suspense>
  );
}
