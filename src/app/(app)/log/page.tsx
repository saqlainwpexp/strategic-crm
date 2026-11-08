import { requirePageUser } from "@/server/session";
import { dueFollowups, loadLog } from "@/server/outreach-log/service";
import { TodayView } from "@/components/outreach-log/TodayView";

export default async function LogTodayPage() {
  const me = await requirePageUser();
  const [{ accounts, contacts, jobs, counts, campaigns }, due] = await Promise.all([loadLog(me), dueFollowups(me)]);
  const totals = {
    contacts: contacts.length,
    jobs: jobs.length,
    activeContacts: contacts.filter((c) => !["won", "lost", "no_response"].includes(c.stage)).length,
    activeJobs: jobs.filter((j) => !["hired", "rejected", "ghosted", "withdrawn"].includes(j.stage)).length,
  };
  return <TodayView due={due} accounts={accounts} counts={counts} totals={totals} campaigns={campaigns} />;
}
