"use client";

// Social outreach data for the signed-in user (seeded on the server, see app layout).
// Writes go through server actions; afterwards the page refreshes so the lead pipeline,
// schedule and outreach data all come back fresh from the database.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCrm } from "./CrmProvider";
import type { OutreachData, OThread } from "@/lib/outreach/types";
import type { OutreachResult } from "@/server/outreach/actions";

type Ctx = {
  data: OutreachData;
  pending: boolean;
  threadById: (id: string) => OThread | undefined;
  threadsForLead: (leadId: string) => OThread[];
  /** Run a server action: toasts the error/warning, refreshes on success. Resolves to the result. */
  act: <T>(request: Promise<OutreachResult<T>>, success?: string | ((d: T) => string)) => Promise<OutreachResult<T>>;
  /** Optimistically patch a thread on screen until the refresh lands. */
  patchThread: (id: string, patch: Partial<OThread>) => void;
};

const OutreachCtx = createContext<Ctx | null>(null);

export function useOutreach() {
  const c = useContext(OutreachCtx);
  if (!c) throw new Error("useOutreach must be used inside <OutreachProvider>");
  return c;
}

export function OutreachProvider({ initial, children }: { initial: OutreachData; children: React.ReactNode }) {
  const router = useRouter();
  const { notify } = useCrm();
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();
  useEffect(() => setData(initial), [initial]);

  const act = useCallback<Ctx["act"]>(
    async (request, success) => {
      try {
        const res = await request;
        if (!res.ok) {
          notify(res.error, "error");
          if (/sign in again/i.test(res.error)) window.location.assign("/login");
          else startTransition(() => router.refresh());
          return res;
        }
        if (res.warning) notify(res.warning, "error");
        else if (success) notify(typeof success === "function" ? success(res.data) : success);
        startTransition(() => router.refresh());
        return res;
      } catch {
        notify("Couldn't reach the server — your last change may not be saved.", "error");
        startTransition(() => router.refresh());
        return { ok: false, error: "offline" } as const;
      }
    },
    [notify, router]
  );

  const value = useMemo<Ctx>(() => {
    const byId = new Map(data.threads.map((t) => [t.id, t]));
    return {
      data,
      pending,
      threadById: (id) => byId.get(id),
      threadsForLead: (leadId) => data.threads.filter((t) => t.leadId === leadId),
      act,
      patchThread: (id, patch) => setData((d) => ({ ...d, threads: d.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
    };
  }, [data, pending, act]);

  return <OutreachCtx.Provider value={value}>{children}</OutreachCtx.Provider>;
}
