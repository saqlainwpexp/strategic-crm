"use client";

// Client store for the CRM. Seeded on the server with the signed-in user's scoped data.
// Every change updates the screen immediately (optimistic) and is saved through a server
// action; if the server rejects it, the user sees why and the data reloads from the database.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert } from "lucide-react";
import type {
  CallDisposition,
  CrmData,
  CsvImport,
  CustomFieldDef,
  Lead,
  Meeting,
  Payment,
  Pool,
  Script,
  Settings,
  User,
} from "@/lib/types";
import { DISPOSITION_LABELS, DISPOSITION_TO_STAGE, STAGE_LABELS, tempFromScore, type PipelineStage } from "@/lib/constants";
import { permissionsFor, type Permissions } from "@/lib/access";
import { uid } from "@/lib/utils";
import {
  assignLeadsAction,
  clockInAction,
  clockOutAction,
  createLeadAction,
  createMeetingAction,
  createPaymentAction,
  importLeadsAction,
  logCallAction,
  moveLeadAction,
  saveCustomFieldAction,
  savePoolAction,
  saveScriptAction,
  saveUserAction,
  updateLeadAction,
  updateMeetingAction,
  updatePaymentAction,
  updateSettingsAction,
  type ActionResult,
} from "@/server/actions";

type LogCallInput = {
  leadId: string;
  durationSec: number;
  disposition: CallDisposition;
  scriptId: string | null;
  notes: string;
  followUpAt?: string | null;
};

type Tone = "success" | "error";

type CrmContext = {
  data: CrmData;
  viewer: User;
  perms: Permissions;
  allUsers: User[];
  userById: (id: string | null | undefined) => User | undefined;
  leadById: (id: string) => Lead | undefined;
  tempOf: (score: number) => ReturnType<typeof tempFromScore>;
  notify: (message: string, tone?: Tone) => void;

  updateLead: (id: string, patch: Partial<Lead>) => void;
  moveLead: (id: string, stage: PipelineStage) => void;
  addLead: (lead: Omit<Lead, "id" | "createdAt">) => Lead;
  importLeads: (leads: Omit<Lead, "id" | "createdAt">[], meta: Omit<CsvImport, "id" | "createdAt" | "uploadedById">) => void;
  assignLeads: (ids: string[], patch: { assignedToId?: string | null; poolId?: string | null }) => void;
  logCall: (input: LogCallInput) => void;

  addMeeting: (m: Omit<Meeting, "id">) => void;
  updateMeeting: (id: string, patch: Partial<Meeting>) => void;
  addPayment: (p: Omit<Payment, "id" | "invoiceNo">) => void;
  updatePayment: (id: string, patch: Partial<Payment>) => void;

  saveScript: (s: Omit<Script, "id" | "updatedAt" | "createdById"> & { id?: string }) => void;
  saveCustomField: (f: Omit<CustomFieldDef, "id"> & { id?: string }) => void;
  savePool: (p: Omit<Pool, "id"> & { id?: string }) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  /** `password` sets a temporary password (new users) or resets it (existing users). */
  saveUser: (u: Omit<User, "id"> & { id?: string; password?: string }) => Promise<boolean>;

  activeShift: () => { clockIn: string } | null;
  clockIn: () => void;
  clockOut: () => void;
};

const Ctx = createContext<CrmContext | null>(null);

export function useCrm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCrm must be used inside <CrmProvider>");
  return ctx;
}

export function CrmProvider({
  initial,
  viewer,
  allUsers,
  children,
}: {
  initial: CrmData;
  viewer: User;
  allUsers: User[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [data, setData] = useState<CrmData>(initial);
  const [toasts, setToasts] = useState<{ id: string; message: string; tone: Tone }[]>([]);

  // A server refresh brings fresh data from the database — adopt it.
  useEffect(() => setData(initial), [initial]);

  const notify = useCallback((message: string, tone: Tone = "success") => {
    const id = uid("t");
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);

  /** Save in the background; on failure explain why and reload the real data. */
  const persist = useCallback(
    <T,>(request: Promise<ActionResult<T>>, onSaved?: (data: T) => void) => {
      request
        .then((res) => {
          if (res.ok) return onSaved?.(res.data);
          notify(res.error, "error");
          if (/sign in again/i.test(res.error)) window.location.assign("/login");
          else router.refresh();
        })
        .catch(() => {
          notify("Couldn't reach the server — your last change may not be saved.", "error");
          router.refresh();
        });
    },
    [notify, router]
  );

  const patch = useCallback(<K extends keyof CrmData>(key: K, fn: (v: CrmData[K]) => CrmData[K]) => {
    setData((d) => ({ ...d, [key]: fn(d[key]) }));
  }, []);

  const value = useMemo<CrmContext>(() => {
    const userMap = new Map([...allUsers, ...data.users].map((u) => [u.id, u]));
    const leadMap = new Map(data.leads.map((l) => [l.id, l]));
    const nowISO = () => new Date().toISOString();

    return {
      data,
      viewer,
      perms: permissionsFor(viewer.role),
      allUsers,
      userById: (id) => (id ? userMap.get(id) : undefined),
      leadById: (id) => leadMap.get(id),
      tempOf: (score) => tempFromScore(score, data.settings.hotThreshold, data.settings.warmThreshold),
      notify,

      updateLead: (id, p) => {
        patch("leads", (ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l)));
        const { id: _id, createdAt: _c, ...fields } = p;
        persist(updateLeadAction(id, fields));
      },

      moveLead: (id, stage) => {
        patch("leads", (ls) =>
          ls.map((l) => (l.id === id ? { ...l, stage, closedAt: stage === "CLOSED_WON" ? l.closedAt ?? nowISO() : null } : l))
        );
        const lead = leadMap.get(id);
        if (lead && lead.stage !== stage) notify(`${lead.businessName} moved to ${STAGE_LABELS[stage]}`);
        persist(moveLeadAction(id, stage));
      },

      addLead: (input) => {
        const lead: Lead = {
          ...input,
          assignedToId: viewer.role === "SALES" ? viewer.id : input.assignedToId,
          id: uid("lead"),
          createdAt: nowISO(),
        };
        patch("leads", (ls) => [lead, ...ls]);
        const { createdAt: _c, ...fields } = lead;
        persist(createLeadAction(fields), () => notify(`${lead.businessName} added`));
        return lead;
      },

      importLeads: (rows, meta) => {
        const created = rows.map((r) => ({ ...r, id: uid("lead"), createdAt: nowISO() }));
        setData((d) => ({
          ...d,
          leads: [...created, ...d.leads],
          imports: [{ ...meta, id: uid("imp"), createdAt: nowISO(), uploadedById: viewer.id }, ...d.imports],
        }));
        persist(
          importLeadsAction(
            created.map(({ createdAt: _c, ...r }) => r),
            meta
          ),
          (res) => {
            notify(`${res.imported} leads imported`);
            // Server-rendered pages (e.g. email Contacts) pick up the new rows.
            router.refresh();
          }
        );
      },

      assignLeads: (ids, p) => {
        const set = new Set(ids);
        patch("leads", (ls) => ls.map((l) => (set.has(l.id) ? { ...l, ...p } : l)));
        persist(assignLeadsAction(ids, p), () => notify(`${ids.length} lead${ids.length === 1 ? "" : "s"} updated`));
      },

      logCall: ({ leadId, durationSec, disposition, scriptId, notes, followUpAt }) => {
        const callId = uid("call");
        const startedAt = new Date(Date.now() - durationSec * 1000).toISOString();
        const nextStage = DISPOSITION_TO_STAGE[disposition];
        setData((d) => ({
          ...d,
          calls: [...d.calls, { id: callId, leadId, userId: viewer.id, startedAt, durationSec, disposition, scriptId, notes }],
          leads: d.leads.map((l) =>
            l.id !== leadId
              ? l
              : {
                  ...l,
                  stage: nextStage ?? l.stage,
                  closedAt: nextStage ? (nextStage === "CLOSED_WON" ? l.closedAt ?? nowISO() : null) : l.closedAt,
                  lastContactedAt: nowISO(),
                  nextFollowUpAt:
                    followUpAt !== undefined
                      ? followUpAt
                      : disposition === "NOT_INTERESTED" || disposition === "MEETING_BOOKED"
                        ? null
                        : l.nextFollowUpAt,
                  notes: notes ? (l.notes ? `${notes}\n${l.notes}` : notes) : l.notes,
                }
          ),
        }));
        notify(nextStage ? `Call logged · moved to ${STAGE_LABELS[nextStage]}` : `Call logged · ${DISPOSITION_LABELS[disposition]}`);
        persist(logCallAction({ id: callId, leadId, durationSec, disposition, scriptId, notes, followUpAt }));
      },

      addMeeting: (m) => {
        const id = uid("mtg");
        setData((d) => ({
          ...d,
          meetings: [...d.meetings, { ...m, id }].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
          leads: d.leads.map((l) =>
            l.id === m.leadId && ["LEAD", "CONTACTED", "INTERESTED", "CALL_ME_LATER", "NO_SHOW"].includes(l.stage)
              ? { ...l, stage: "MEETING_BOOKED" }
              : l
          ),
        }));
        persist(createMeetingAction({ ...m, id }), () => notify("Meeting booked"));
      },

      updateMeeting: (id, p) => {
        setData((d) => {
          const meeting = d.meetings.find((m) => m.id === id);
          const stage: PipelineStage | null = p.status === "SHOWED" ? "SHOWED" : p.status === "NO_SHOW" ? "NO_SHOW" : null;
          return {
            ...d,
            meetings: d.meetings.map((m) => (m.id === id ? { ...m, ...p } : m)),
            leads:
              meeting && stage ? d.leads.map((l) => (l.id === meeting.leadId && l.stage !== "CLOSED_WON" ? { ...l, stage } : l)) : d.leads,
          };
        });
        persist(updateMeetingAction(id, { status: p.status, scheduledAt: p.scheduledAt, notes: p.notes }), () => {
          if (p.status) notify(`Meeting marked ${p.status === "NO_SHOW" ? "no show" : p.status.toLowerCase()}`);
        });
      },

      addPayment: (p) => {
        const id = uid("pay");
        patch("payments", (ps) => [...ps, { ...p, id, invoiceNo: "Saving…" }]);
        persist(createPaymentAction({ ...p, id }), ({ invoiceNo }) => {
          patch("payments", (ps) => ps.map((x) => (x.id === id ? { ...x, invoiceNo } : x)));
          notify(`Payment recorded · ${invoiceNo}`);
        });
      },

      updatePayment: (id, p) => {
        patch("payments", (ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
        persist(updatePaymentAction(id, { status: p.status, paidAt: p.paidAt }), () => {
          if (p.status === "PAID") notify("Marked as paid");
        });
      },

      saveScript: (s) => {
        const id = s.id ?? uid("scr");
        const updatedAt = nowISO();
        patch("scripts", (list) =>
          list.some((x) => x.id === id)
            ? list.map((x) => (x.id === id ? { ...x, ...s, id, updatedAt } : x))
            : [...list, { ...s, id, createdById: viewer.id, updatedAt }]
        );
        persist(saveScriptAction({ id, title: s.title, category: s.category, body: s.body, active: s.active }), () => notify("Script saved"));
      },

      saveCustomField: (f) => {
        const id = f.id ?? uid("cf");
        patch("customFields", (list) =>
          list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...f, id } : x)) : [...list, { ...f, id }]
        );
        persist(saveCustomFieldAction({ ...f, id }), () => notify(`Field "${f.name}" saved`));
      },

      savePool: (p) => {
        const id = p.id ?? uid("pool");
        patch("pools", (list) =>
          list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...p, id } : x)) : [...list, { ...p, id }]
        );
        persist(savePoolAction({ ...p, id }), () => notify(`Pool "${p.name}" saved`));
      },

      updateSettings: (p) => {
        patch("settings", (s) => ({ ...s, ...p }));
        persist(updateSettingsAction({ ...data.settings, ...p }), () => notify("Settings saved"));
      },

      saveUser: async ({ password, ...u }) => {
        const id = u.id ?? uid("u");
        const res = await saveUserAction({ ...u, id, password });
        if (!res.ok) {
          notify(res.error, "error");
          return false;
        }
        patch("users", (list) =>
          list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...u, id } : x)) : [...list, { ...u, id }]
        );
        notify(`${u.name} saved`);
        router.refresh();
        return true;
      },

      activeShift: () => {
        const open = data.timeLogs.find((t) => t.userId === viewer.id && t.clockOut === null);
        return open ? { clockIn: open.clockIn } : null;
      },

      clockIn: () => {
        const tempId = uid("tl");
        patch("timeLogs", (ts) => [...ts, { id: tempId, userId: viewer.id, clockIn: nowISO(), clockOut: null }]);
        persist(clockInAction(), (shift) => {
          patch("timeLogs", (ts) => ts.map((t) => (t.id === tempId ? { ...t, id: shift.id, clockIn: shift.clockIn } : t)));
          notify("Shift started");
        });
      },

      clockOut: () => {
        const at = nowISO();
        patch("timeLogs", (ts) => ts.map((t) => (t.userId === viewer.id && t.clockOut === null ? { ...t, clockOut: at } : t)));
        persist(clockOutAction(), () => notify("Shift ended"));
      },
    };
  }, [data, viewer, allUsers, notify, patch, persist, router]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="animate-pop-in flex max-w-[560px] items-center gap-2.5 rounded-full bg-ink py-3 pl-3 pr-5 text-[13.5px] text-white shadow-2xl"
          >
            <span className={t.tone === "error" ? "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E5484D]" : "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand"}>
              {t.tone === "error" ? <CircleAlert className="h-3.5 w-3.5" strokeWidth={2.4} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.4} />}
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
