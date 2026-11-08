import { Suspense } from "react";
import { requirePageUser } from "@/server/session";
import { loadLog } from "@/server/outreach-log/service";
import { JobsView } from "@/components/outreach-log/JobsView";

export default async function LogJobsPage() {
  const me = await requirePageUser();
  const { accounts, jobs } = await loadLog(me);
  return (
    <Suspense>
      <JobsView jobs={jobs} accounts={accounts} />
    </Suspense>
  );
}
