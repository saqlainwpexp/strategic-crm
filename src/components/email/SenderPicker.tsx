"use client";

import Link from "next/link";
import { Check, CircleAlert, Globe } from "lucide-react";
import { buttonClass } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Form";
import { cn } from "@/lib/utils";
import type { EmailAccountView } from "@/lib/email-types";
import { ACCOUNT_STATUS } from "./kit";

export const ALL_INBOXES = "*";

/** Capacity of the inboxes a campaign/workflow will rotate through. */
export function senderCapacity(accounts: EmailAccountView[], value: string[]) {
  const live = accounts.filter((a) => a.status === "CONNECTED" || a.status === "PENDING");
  const used = value.includes(ALL_INBOXES) ? live : live.filter((a) => value.includes(a.id));
  return { inboxes: used.length, domains: new Set(used.map((a) => a.domain)).size, perDay: used.reduce((s, a) => s + a.dailyLimit, 0) };
}

/**
 * "Rotate across all inboxes" (the default — new inboxes join automatically), or hand-pick
 * inboxes grouped by domain.
 */
export function SenderPicker({ accounts, value, onChange }: { accounts: EmailAccountView[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = value.includes(ALL_INBOXES);
  const cap = senderCapacity(accounts, value);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-soft p-5 text-[13.5px]">
        <CircleAlert className="h-4 w-4 text-brand" /> No inboxes connected yet.
        <Link href="/email/sending?new=1" className={buttonClass("primary", "sm", "ml-auto")}>
          Add inboxes
        </Link>
      </div>
    );
  }

  const byDomain = new Map<string, EmailAccountView[]>();
  for (const a of accounts) byDomain.set(a.domain, [...(byDomain.get(a.domain) ?? []), a]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-soft p-5">
        <Toggle
          checked={all}
          onChange={(on) => onChange(on ? [ALL_INBOXES] : accounts.filter((a) => a.status === "CONNECTED").map((a) => a.id))}
          label={<span className="text-[14px] font-medium">Rotate across all connected inboxes</span>}
        />
        <p className="text-[13px] tabular-nums text-neutral-600">
          {cap.inboxes} inbox{cap.inboxes === 1 ? "" : "es"} · {cap.domains} domain{cap.domains === 1 ? "" : "s"} · up to <span className="text-ink">{cap.perDay.toLocaleString("en-US")}</span> emails/day
        </p>
      </div>
      {!all && (
        <div className="mt-4 flex flex-col gap-4">
          {[...byDomain].map(([domain, list]) => (
            <div key={domain}>
              <p className="mb-2 flex items-center gap-2 text-[12.5px] text-neutral-500">
                <Globe className="h-3.5 w-3.5" /> {domain}
              </p>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {list.map((a) => {
                  const on = value.includes(a.id);
                  const st = ACCOUNT_STATUS[a.status];
                  return (
                    <button
                      key={a.id}
                      type="button"
                      disabled={a.status === "DISCONNECTED"}
                      onClick={() => onChange(on ? value.filter((x) => x !== a.id) : [...value, a.id])}
                      className={cn(
                        "flex items-center gap-3.5 rounded-2xl border p-4 text-left transition disabled:opacity-50",
                        on ? "border-ink shadow-[0_0_0_1px_rgb(var(--ink))]" : "border-black/[0.08] hover:border-black/20"
                      )}
                    >
                      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", on ? "border-ink bg-ink text-white" : "border-neutral-300")}>
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{a.email}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-neutral-500">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                          {st.label} · {a.dailyLimit}/day
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
