import { Suspense } from "react";
import { requirePageUser } from "@/server/session";
import { listAccounts, readSignalConfig, sendCounts } from "@/server/outreach-log/service";
import { AccountsView } from "@/components/outreach-log/AccountsView";

export default async function LogAccountsPage() {
  const me = await requirePageUser();
  const canManage = me.role === "MANAGER" || me.role === "SUPER_ADMIN";
  const [accounts, counts, signal] = await Promise.all([listAccounts(me), sendCounts(me), canManage ? readSignalConfig() : Promise.resolve(null)]);
  return (
    <Suspense>
      <AccountsView accounts={accounts} counts={counts} signal={signal ? { ...signal, bearer: signal.bearer ? "••••" : "" } : null} canManage={canManage} />
    </Suspense>
  );
}
