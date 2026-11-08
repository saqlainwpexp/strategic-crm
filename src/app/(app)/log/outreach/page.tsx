import { Suspense } from "react";
import { requirePageUser } from "@/server/session";
import { loadLog } from "@/server/outreach-log/service";
import { ContactsView } from "@/components/outreach-log/ContactsView";

export default async function LogOutreachPage() {
  const me = await requirePageUser();
  const { accounts, contacts } = await loadLog(me);
  return (
    <Suspense>
      <ContactsView contacts={contacts} accounts={accounts} />
    </Suspense>
  );
}
