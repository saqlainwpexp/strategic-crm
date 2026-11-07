import { Suspense } from "react";
import { ContactsView } from "@/components/email/ContactsView";
import { getDb } from "@/server/db";
import { loadAudienceOptions, loadContacts, loadReps } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ContactsPage({ searchParams }: { searchParams: Search }) {
  await requireEmailPage();
  const sp = await searchParams;
  const contactId = one(sp.contact);
  const [list, options, automations, focus, reps] = await Promise.all([
    loadContacts({ q: one(sp.q), status: one(sp.status), tag: one(sp.tag), stage: one(sp.stage), page: Number(one(sp.page)) || 1 }),
    loadAudienceOptions(),
    (await getDb()).automation.findMany({ select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }),
    /^[A-Za-z0-9_-]{1,64}$/.test(contactId) ? loadContacts({ id: contactId }).then((r) => r.contacts[0] ?? null) : Promise.resolve(null),
    loadReps(),
  ]);
  return (
    <Suspense>
      <ContactsView
        contacts={list.contacts}
        total={list.total}
        page={list.page}
        pages={list.pages}
        tags={options.tags}
        automations={automations}
        focus={focus}
        reps={reps}
      />
    </Suspense>
  );
}
