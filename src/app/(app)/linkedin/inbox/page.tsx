import { InboxView } from "@/components/linkedin/InboxView";
import { loadInbox, loadAccounts } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInInboxPage() {
  await requireLinkedInPage();
  const [conversations, accounts] = await Promise.all([loadInbox(), loadAccounts()]);
  return <InboxView conversations={conversations} accounts={accounts} />;
}
