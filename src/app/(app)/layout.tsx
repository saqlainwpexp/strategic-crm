import { TopNav } from "@/components/layout/TopNav";
import { CrmProvider } from "@/components/providers/CrmProvider";
import { ReminderCenter } from "@/components/reminders/ReminderCenter";
import { requirePageUser } from "@/server/session";
import { loadCrmData } from "@/server/load";
import { getBranding } from "@/server/settings";
import { setTimeZone } from "@/lib/date";
import { permissionsFor } from "@/lib/access";
import { unreadThreadCount } from "@/server/email/load";

// Per-user, per-request data.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requirePageUser();
  setTimeZone((await getBranding()).timezone);
  const [{ data, allUsers }, unreadReplies] = await Promise.all([
    loadCrmData(viewer),
    permissionsFor(viewer.role).emailMarketing ? unreadThreadCount() : Promise.resolve(0),
  ]);

  return (
    <CrmProvider key={viewer.id} initial={data} viewer={viewer} allUsers={allUsers}>
      <div className="min-h-screen bg-page text-ink">
        <TopNav unreadReplies={unreadReplies} />
        <main className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-10">{children}</main>
      </div>
      <ReminderCenter />
    </CrmProvider>
  );
}
