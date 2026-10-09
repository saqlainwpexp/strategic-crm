import { Suspense } from "react";
import { SendingView } from "@/components/email/SendingView";
import { loadAccounts, loadDomains } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function SendingPage() {
  await requireEmailPage();
  const [accounts, domains] = await Promise.all([loadAccounts(), loadDomains()]);
  return (
    <Suspense>
      <SendingView accounts={accounts} domains={domains} />
    </Suspense>
  );
}
