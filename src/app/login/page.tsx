import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/session";
import { HOME_PATH } from "@/lib/nav";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect(HOME_PATH);
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
