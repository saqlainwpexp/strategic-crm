import { TemplatesView } from "@/components/linkedin/TemplatesView";
import { loadTemplates } from "@/server/linkedin/load";
import { requireLinkedInPage } from "@/server/linkedin/access";

export default async function LinkedInTemplatesPage() {
  await requireLinkedInPage();
  return <TemplatesView templates={await loadTemplates()} />;
}
