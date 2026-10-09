import { Suspense } from "react";
import { AutomationEditor } from "@/components/email/AutomationEditor";
import { loadAccounts, loadAudienceOptions, loadTemplates } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function NewAutomationPage() {
  await requireEmailPage();
  const [accounts, templates, options] = await Promise.all([loadAccounts(), loadTemplates(), loadAudienceOptions()]);
  return (
    <Suspense>
      <AutomationEditor automation={null} enrollments={[]} accounts={accounts} templates={templates} tags={options.tags} reps={options.reps} />
    </Suspense>
  );
}
