import { notFound } from "next/navigation";
import { AutomationEditor } from "@/components/email/AutomationEditor";
import { loadAccounts, loadAudienceOptions, loadAutomation, loadTemplates } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireEmailPage();
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const [data, accounts, templates, options] = await Promise.all([loadAutomation(id), loadAccounts(), loadTemplates(), loadAudienceOptions()]);
  if (!data) notFound();
  return (
    <AutomationEditor
      key={`${data.automation.id}-${data.automation.updatedAt}`}
      automation={data.automation}
      enrollments={data.enrollments}
      accounts={accounts}
      templates={templates}
      tags={options.tags}
    />
  );
}
