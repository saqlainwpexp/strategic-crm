"use client";

// Client-side store for the CRM. Seeded from the server with the viewer's scoped data;
// every page reads and mutates through it so changes show up everywhere at once.
// When the database is connected these actions become server actions.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
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

type LogCallInput = {
  leadId: string;
  durationSec: number;
  disposition: CallDisposition;
  scriptId: string | null;
  notes: string;
  followUpAt?: string | null;
};

type CrmContext = {
  data: CrmData;
  viewer: User;
  perms: Permissions;
  allUsers: User[];
  userById: (id: string | null | undefined) => User | undefined;
  leadById: (id: string) => Lead | undefined;
  tempOf: (score: number) => ReturnType<typeof tempFromScore>;
  notify: (message: string) => void;

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
  saveUser: (u: Omit<User, "id"> & { id?: string }) => void;

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
  const [data, setData] = useState<CrmData>(initial);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const invoiceSeq = useRef(900);

  const notify = useCallback((message: string) => {
    const id = uid("t");
    setToasts((t) => [...t.slice(-2), { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const patch = useCallback(<K extends keyof CrmData>(key: K, fn: (v: CrmData[K]) => CrmData[K]) => {
    setData((d) => ({ ...d, [key]: fn(d[key]) }));
  }, []);

  const value = useMemo<CrmContext>(() => {
    // Users added this session live in data.users; allUsers covers names outside the viewer's scope.
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

      updateLead: (id, p) => patch("leads", (ls) => ls.map((l) => (l.id === id ? { ...l, ...p } : l))),

      moveLead: (id, stage) => {
        patch("leads", (ls) =>
          ls.map((l) =>
            l.id === id
              ? { ...l, stage, closedAt: stage === "CLOSED_WON" ? l.closedAt ?? nowISO() : null }
              : l
          )
        );
        const lead = leadMap.get(id);
        if (lead && lead.stage !== stage) notify(`${lead.businessName} moved to ${STAGE_LABELS[stage]}`);
      },

      addLead: (input) => {
        const lead: Lead = { ...input, id: uid("lead"), createdAt: nowISO() };
        patch("leads", (ls) => [lead, ...ls]);
        notify(`${lead.businessName} added`);
        return lead;
      },

      importLeads: (rows, meta) => {
        const created = rows.map((r) => ({ ...r, id: uid("lead"), createdAt: nowISO() }));
        setData((d) => ({
          ...d,
          leads: [...created, ...d.leads],
          imports: [{ ...meta, id: uid("imp"), createdAt: nowISO(), uploadedById: viewer.id }, ...d.imports],
        }));
        notify(`${created.length} leads imported`);
      },

      assignLeads: (ids, p) => {
        const set = new Set(ids);
        patch("leads", (ls) => ls.map((l) => (set.has(l.id) ? { ...l, ...p } : l)));
        notify(`${ids.length} lead${ids.length === 1 ? "" : "s"} updated`);
      },

      logCall: ({ leadId, durationSec, disposition, scriptId, notes, followUpAt }) => {
        const startedAt = new Date(Date.now() - durationSec * 1000).toISOString();
        const nextStage = DISPOSITION_TO_STAGE[disposition];
        setData((d) => ({
          ...d,
          calls: [...d.calls, { id: uid("call"), leadId, userId: viewer.id, startedAt, durationSec, disposition, scriptId, notes }],
          leads: d.leads.map((l) =>
            l.id !== leadId
              ? l
              : {
                  ...l,
                  stage: nextStage ?? l.stage,
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
        notify(
          nextStage
            ? `Call logged · moved to ${STAGE_LABELS[nextStage]}`
            : `Call logged · ${DISPOSITION_LABELS[disposition]}`
        );
      },

      addMeeting: (m) => {
        setData((d) => ({
          ...d,
          meetings: [...d.meetings, { ...m, id: uid("mtg") }].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
          leads: d.leads.map((l) =>
            l.id === m.leadId && ["LEAD", "CONTACTED", "INTERESTED", "CALL_ME_LATER", "NO_SHOW"].includes(l.stage)
              ? { ...l, stage: "MEETING_BOOKED" }
              : l
          ),
        }));
        notify("Meeting booked");
      },

      updateMeeting: (id, p) => {
        setData((d) => {
          const meeting = d.meetings.find((m) => m.id === id);
          const stage: PipelineStage | null =
            p.status === "SHOWED" ? "SHOWED" : p.status === "NO_SHOW" ? "NO_SHOW" : null;
          return {
            ...d,
            meetings: d.meetings.map((m) => (m.id === id ? { ...m, ...p } : m)),
            leads:
              meeting && stage
                ? d.leads.map((l) => (l.id === meeting.leadId && l.stage !== "CLOSED_WON" ? { ...l, stage } : l))
                : d.leads,
          };
        });
        if (p.status) notify(`Meeting marked ${p.status === "NO_SHOW" ? "no show" : p.status.toLowerCase()}`);
      },

      addPayment: (p) => {
        const n = invoiceSeq.current++;
        patch("payments", (ps) => [...ps, { ...p, id: uid("pay"), invoiceNo: `INV-2026-${String(n).padStart(4, "0")}` }]);
        notify("Payment recorded");
      },

      updatePayment: (id, p) => {
        patch("payments", (ps) => ps.map((x) => (x.id === id ? { ...x, ...p } : x)));
        if (p.status === "PAID") notify("Marked as paid");
      },

      saveScript: (s) => {
        const updatedAt = nowISO();
        patch("scripts", (list) =>
          s.id && list.some((x) => x.id === s.id)
            ? list.map((x) => (x.id === s.id ? { ...x, ...s, id: x.id, updatedAt } : x))
            : [...list, { ...s, id: s.id ?? uid("scr"), createdById: viewer.id, updatedAt }]
        );
        notify("Script saved");
      },

      saveCustomField: (f) => {
        patch("customFields", (list) =>
          f.id && list.some((x) => x.id === f.id)
            ? list.map((x) => (x.id === f.id ? { ...x, ...f, id: x.id } : x))
            : [...list, { ...f, id: f.id ?? uid("cf") }]
        );
        notify(`Field "${f.name}" saved`);
      },

      savePool: (p) => {
        patch("pools", (list) =>
          p.id && list.some((x) => x.id === p.id)
            ? list.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id } : x))
            : [...list, { ...p, id: p.id ?? uid("pool") }]
        );
        notify(`Pool "${p.name}" saved`);
      },

      updateSettings: (p) => {
        patch("settings", (s) => ({ ...s, ...p }));
        notify("Settings saved");
      },

      saveUser: (u) => {
        patch("users", (list) =>
          u.id && list.some((x) => x.id === u.id)
            ? list.map((x) => (x.id === u.id ? { ...x, ...u, id: x.id } : x))
            : [...list, { ...u, id: u.id ?? uid("u") }]
        );
        notify(`${u.name} saved`);
      },

      activeShift: () => {
        const open = data.timeLogs.find((t) => t.userId === viewer.id && t.clockOut === null);
        return open ? { clockIn: open.clockIn } : null;
      },

      clockIn: () => {
        patch("timeLogs", (ts) => [...ts, { id: uid("tl"), userId: viewer.id, clockIn: nowISO(), clockOut: null }]);
        notify("Shift started");
      },

      clockOut: () => {
        patch("timeLogs", (ts) =>
          ts.map((t) => (t.userId === viewer.id && t.clockOut === null ? { ...t, clockOut: nowISO() } : t))
        );
        notify("Shift ended");
      },
    };
  }, [data, viewer, allUsers, notify, patch]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-pop-in flex items-center gap-2.5 rounded-full bg-ink py-3 pl-3 pr-5 text-[13.5px] text-white shadow-2xl"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand">
              <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
            </span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
