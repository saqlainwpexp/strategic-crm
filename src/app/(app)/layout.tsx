import { TopNav } from "@/components/layout/TopNav";
import { CrmProvider } from "@/components/providers/CrmProvider";
import { ReminderCenter } from "@/components/reminders/ReminderCenter";
import { getSeed } from "@/lib/data/seed";
import { scopeData } from "@/lib/access";
import { getViewer } from "@/lib/viewer";

// Depends on the viewer cookie and the current time.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = getViewer();
  const seed = getSeed();
  const data = scopeData(viewer, seed);

  return (
    <CrmProvider key={viewer.id} initial={data} viewer={viewer} allUsers={seed.users}>
      <div className="min-h-screen bg-page text-ink">
        <TopNav />
        <main className="mx-auto max-w-[1440px] px-6 pb-16 lg:px-10">{children}</main>
      </div>
      <ReminderCenter />
    </CrmProvider>
  );
}
