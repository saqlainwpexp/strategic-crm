import { requirePageUser } from "@/server/session";
import { QuickAddClient } from "./QuickAddClient";

export const dynamic = "force-dynamic";

// Opened by the bookmarklet in a small window. Signed-out users are sent to /login first.
export default async function QuickAddPage({ searchParams }: { searchParams: Promise<{ url?: string; title?: string }> }) {
  await requirePageUser();
  const { url = "", title = "" } = await searchParams;
  return (
    <main className="min-h-screen bg-page px-5 py-6 text-ink">
      <QuickAddClient url={url.slice(0, 1000)} title={title.slice(0, 300)} />
    </main>
  );
}
