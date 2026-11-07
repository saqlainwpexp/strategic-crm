import { SignupForm } from "./SignupForm";
import { getCurrentUser } from "@/server/session";
import { redirect } from "next/navigation";
import { HOME_PATH } from "@/lib/nav";
export const dynamic = "force-dynamic";
export default async function SignupPage() {
  if (await getCurrentUser()) redirect(HOME_PATH);
  return <main className="flex min-h-screen items-center justify-center bg-page px-6 py-12"><SignupForm /></main>;
}
