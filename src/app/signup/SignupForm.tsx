"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Field, Input } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { HOME_PATH } from "@/lib/nav";
export function SignupForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Couldn't create your account.");
      const login = await signIn("credentials", { email: String(data.email).trim().toLowerCase(), password: data.password, redirect: false });
      if (!login?.ok) { router.replace("/login"); return; }
      router.replace(HOME_PATH); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't reach the server. Please try again."); setPending(false); }
  }
  return <div className="w-full max-w-[460px]">
    <h1 className="text-center text-3xl tracking-tight">Create your agency account</h1>
    <p className="mt-3 mb-8 text-center text-sm text-neutral-500">Your own workspace for leads, outreach and your team.</p>
    <form onSubmit={submit} className="rounded-3xl bg-white p-8">
      <div className="grid gap-5">
        <Field label="Agency name"><Input name="agencyName" required minLength={2} maxLength={100} autoComplete="organization" autoFocus /></Field>
        <Field label="Your name"><Input name="name" required minLength={2} maxLength={100} autoComplete="name" /></Field>
        <Field label="Email"><Input name="email" type="email" required maxLength={254} autoComplete="email" /></Field>
        <Field label="Password"><Input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" /><p className="mt-2 text-xs text-neutral-500">Use at least 10 characters.</p></Field>
        <div hidden aria-hidden="true"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      </div>
      {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <Button type="submit" size="lg" className="mt-7 w-full" disabled={pending}>{pending ? "Creating your workspace…" : "Create account"}</Button>
      <p className="mt-5 text-center text-sm text-neutral-500">Already have an account? <Link className="font-medium text-ink underline" href="/login">Sign in</Link></p>
    </form>
  </div>;
}
