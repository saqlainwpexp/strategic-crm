import { Suspense } from "react";
import { TemplatesView } from "@/components/email/TemplatesView";
import { loadAccounts, loadTemplates } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function TemplatesPage() {
  await requireEmailPage();
  const [templates, accounts] = await Promise.all([loadTemplates(), loadAccounts()]);
  return (
    <Suspense>
      <TemplatesView templates={templates} accounts={accounts} />
    </Suspense>
  );
}
