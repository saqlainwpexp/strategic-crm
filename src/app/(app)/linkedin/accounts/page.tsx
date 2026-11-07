import { AccountsView } from "@/components/linkedin/AccountsView";
import { loadAccounts } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInAccountsPage() {
  await requireLinkedInPage();
  return <AccountsView accounts={await loadAccounts()} />;
}
