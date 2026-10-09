import { AutomationsView } from "@/components/email/AutomationsView";
import { loadAutomations } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

export default async function AutomationsPage() {
  await requireEmailPage();
  return <AutomationsView automations={await loadAutomations()} />;
}
