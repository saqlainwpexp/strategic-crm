"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useBranding } from "@/components/providers/BrandingProvider";
import { BrandMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { HOME_PATH } from "@/lib/nav";

/** Only allow redirects back into this app (no open redirects). */
function safeCallback(raw: string | null) {
  if (!raw) return HOME_PATH;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/login")) return HOME_PATH;
    return url.pathname + url.search;
  } catch {
    return HOME_PATH;
  }
}

export function LoginForm() {
  const { branding } = useBranding();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
      if (res?.ok) {
        router.replace(safeCallback(params.get("callbackUrl")));
        router.refresh();
        return;
      }
      // Same message for every failure so it doesn't reveal which emails exist.
      setError("That email and password don't match, or the account is temporarily locked after too many attempts.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setPending(false);
  };

  return (
    <div className="w-full max-w-[440px]">
      <div className="mb-10 flex flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-header text-header-fg">
          <BrandMark className="h-8 w-8 text-header-fg" imgClassName="h-10 max-w-[48px]" />
        </span>
        <h1 className="mt-6 text-[30px] font-normal tracking-[-0.02em]">{branding.appName}</h1>
        <p className="mt-2 text-[14px] text-neutral-500">Sign in to your workspace</p>
      </div>

      <form onSubmit={submit} className="rounded-[24px] bg-white p-8" noValidate>
        <div className="grid gap-5">
          <Field label="Email">
            <Input type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-neutral-500 hover:bg-page hover:text-ink"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-5 flex gap-2 rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-7 w-full" disabled={pending || !email || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="mt-5 text-center text-[12.5px] text-neutral-500">Forgot your password? Ask your manager or admin to reset it.</p>
      </form>
    </div>
  );
}
