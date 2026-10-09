import { Suspense } from "react";
import { InboxView } from "@/components/email/InboxView";
import { loadAccounts, loadReps, loadThreads } from "@/server/email/load";
import { requireEmailPage } from "@/server/email/access";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function InboxPage({ searchParams }: { searchParams: Search }) {
  await requireEmailPage();
  const sp = await searchParams;
  const [threads, accounts, reps] = await Promise.all([
    loadThreads({ folder: one(sp.folder), account: one(sp.account) || undefined, q: one(sp.q) }),
    loadAccounts(),
    loadReps(),
  ]);
  return (
    <Suspense>
      <InboxView threads={threads} accounts={accounts} reps={reps} />
    </Suspense>
  );
}
