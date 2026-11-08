// OAuth 2.1 consent screen. Outside the auth middleware so bad requests get a clear error and the
// return-to-login path stays relative, whatever host the app sits behind.

import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { checkAuthorizeRequest } from "@/server/outreach/oauth-core";
import { ConsentForm } from "./ConsentForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an app" };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
      <div className="w-full max-w-[480px] rounded-3xl bg-white p-10 shadow-sm">{children}</div>
    </main>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <h1 className="text-[22px] font-medium">{title}</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-neutral-600">{body}</p>
    </Shell>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  // A repeated parameter is invalid in OAuth, so only single values go through.
  const params = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  const check = checkAuthorizeRequest(params);
  if (check.kind === "fatal") return <Notice title="Can't connect this app" body={check.message} />;
  if (check.kind === "redirect") redirect(check.url);

  const me = await getCurrentUser();
  if (!me) redirect(`/login?callbackUrl=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params)}`)}`);
  if (me.role !== "MANAGER" && me.role !== "SUPER_ADMIN")
    return <Notice title="Ask a manager to connect this app" body="Only managers and admins can give an app access to the CRM." />;

  const users = await (await getDb()).user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const { client, redirectUri } = check.request;
  let destination = redirectUri;
  try {
    const url = new URL(redirectUri);
    destination = url.host || url.protocol;
  } catch {}

  return (
    <Shell>
      <ConsentForm params={params} clientName={client.name} destination={destination} users={users} defaultUserId={me.id} />
    </Shell>
  );
}
