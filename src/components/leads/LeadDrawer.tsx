"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  PhoneCall,
  PhoneMissed,
  User as UserIcon,
  Video,
  X,
} from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Drawer } from "@/components/ui/Overlay";
import { Button, IconButton, buttonClass } from "@/components/ui/Button";
import { Chip, PriorityFlag, StatusDot, TempPill } from "@/components/ui/Badges";
import { Segmented } from "@/components/ui/Segmented";
import { Select, Textarea } from "@/components/ui/Form";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { Avatar } from "@/components/ui/Avatar";
import { MeetingModal } from "@/components/shared/MeetingModal";
import { CallPanel } from "./CallPanel";
import {
  CONNECT_DISPOSITIONS,
  DISPOSITION_LABELS,
  MEETING_STATUS_DOT,
  MEETING_STATUS_LABELS,
  PIPELINE_STAGES,
  STAGE_DOT,
  STAGE_LABELS,
  type PipelineStage,
} from "@/lib/constants";
import type { CustomFieldDef, CustomFieldValue, Lead } from "@/lib/types";
import { dialHref } from "@/lib/dial";
import { dayKey, dayLabel, formatDateTime, formatDateYear, formatTime } from "@/lib/date";
import { cn, formatDuration, formatMoney } from "@/lib/utils";

type Tab = "overview" | "activity" | "notes";

export function LeadDrawer({
  leadId,
  startCall,
  onClose,
  onEdit,
  afterCall,
}: {
  leadId: string | null;
  startCall?: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  /** Runs after a call is saved, unless a meeting still needs booking. */
  afterCall?: () => void;
}) {
  const { leadById, data, tempOf } = useCrm();
  const lead = leadId ? leadById(leadId) : undefined;
  const [tab, setTab] = useState<Tab>("overview");
  const [calling, setCalling] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    setTab("overview");
    setCalling(!!startCall);
  }, [leadId, startCall]);

  const activityCount = useMemo(
    () => (lead ? data.calls.filter((c) => c.leadId === lead.id).length + data.meetings.filter((m) => m.leadId === lead.id).length : 0),
    [lead, data.calls, data.meetings]
  );

  return (
    <>
      <Drawer open={!!lead} onClose={onClose} className="sm:max-w-[max(75vw,640px)]">
        {lead && (
          <>
            {/* Compact header: identity and status chips share one row */}
            <div className="flex items-center gap-4 border-b border-neutral-100 px-8 py-5">
              <LeadThumb lead={lead} size={48} />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-8 gap-y-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[21px] font-medium leading-tight tracking-[-0.015em]">{lead.businessName}</h2>
                  <p className="mt-1 truncate text-[13px] text-neutral-500">{lead.address}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StageSelect lead={lead} />
                  <TempPill temp={tempOf(lead.leadScore)} score={lead.leadScore} />
                  <Chip className="h-8">{lead.service}</Chip>
                  <span className="px-1">
                    <PriorityFlag priority={lead.priority} />
                  </span>
                </div>
              </div>
              <IconButton label="Close" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-8 py-6">
              {calling ? (
                <CallPanel
                  lead={lead}
                  onDone={() => setCalling(false)}
                  onBookMeeting={() => setBooking(true)}
                  onSaved={(d) => d !== "MEETING_BOOKED" && afterCall?.()}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={dialHref(lead.phone, data.settings.dialerScheme)}
                    onClick={() => setCalling(true)}
                    className={buttonClass("brand", "lg", "flex-1 sm:flex-none")}
                  >
                    <PhoneCall className="h-4 w-4" />
                    Call {lead.phone}
                  </a>
                  <Button variant="secondary" size="lg" onClick={() => setBooking(true)}>
                    <CalendarPlus className="h-4 w-4" />
                    Book meeting
                  </Button>
                  <div className="ml-auto flex items-center gap-2">
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} aria-label="Email" title="Email" className="grid h-11 w-11 place-items-center rounded-full bg-page hover:bg-neutral-200">
                        <Mail className="h-4 w-4" />
                      </a>
                    )}
                    {lead.website && (
                      <a
                        href={`https://${lead.website.replace(/^https?:\/\//, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Website"
                        title="Open website"
                        className="grid h-11 w-11 place-items-center rounded-full bg-page hover:bg-neutral-200"
                      >
                        <Globe className="h-4 w-4" />
                      </a>
                    )}
                    <IconButton label="Edit lead" size="lg" onClick={() => onEdit(lead)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              )}

              <Segmented
                className="mt-7"
                value={tab}
                onChange={setTab}
                options={[
                  { value: "overview", label: "Overview" },
                  { value: "activity", label: "Activity", count: activityCount },
                  { value: "notes", label: "Notes" },
                ]}
              />

              <div className="mt-6">
                {tab === "overview" && <Overview lead={lead} />}
                {tab === "activity" && <Activity lead={lead} />}
                {tab === "notes" && <Notes lead={lead} />}
              </div>
            </div>
          </>
        )}
      </Drawer>
      <MeetingModal open={booking} onClose={() => setBooking(false)} leadId={lead?.id} />
    </>
  );
}

function StageSelect({ lead }: { lead: Lead }) {
  const { moveLead } = useCrm();
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-[2px]" style={{ background: STAGE_DOT[lead.stage] }} />
      <select
        aria-label="Pipeline stage"
        value={lead.stage}
        onChange={(e) => moveLead(lead.id, e.target.value as PipelineStage)}
        className="h-8 cursor-pointer appearance-none rounded-full bg-ink pl-8 pr-8 text-[12.5px] text-white outline-none"
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7 last:mb-0">
      <h3 className="mb-4 text-[12px] font-medium uppercase tracking-[0.08em] text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

function Info({ icon: Icon, label, children }: { icon?: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      {Icon && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page text-neutral-700">
          <Icon className="h-4 w-4" strokeWidth={1.7} />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[12px] text-neutral-500">{label}</p>
        <div className="mt-0.5 break-words text-[14px] text-ink">{children}</div>
      </div>
    </div>
  );
}

function Overview({ lead }: { lead: Lead }) {
  const { data, perms, userById, assignLeads } = useCrm();
  const issues = lead.issues.split("\n").filter(Boolean);
  const solutions = lead.suggestedServices.split("\n").filter(Boolean);
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");
  const pool = data.pools.find((p) => p.id === lead.poolId);
  const fields = data.customFields.filter((f) => f.active);

  return (
    <div>
      <Section title="Contact">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <Info icon={UserIcon} label="Decision maker">{lead.decisionMakerName || "—"}</Info>
          <Info icon={Phone} label="Phone">{lead.phone || "—"}</Info>
          <Info icon={Mail} label="Email">{lead.email || "—"}</Info>
          <Info icon={Globe} label="Website">
            {lead.website ? (
              <a className="underline-offset-4 hover:underline" href={`https://${lead.website}`} target="_blank" rel="noreferrer">
                {lead.website}
              </a>
            ) : (
              <span className="text-neutral-400">No website</span>
            )}
          </Info>
          <div className="sm:col-span-2">
            <Info icon={MapPin} label="Address">{lead.address || "—"}</Info>
          </div>
        </div>
      </Section>

      <Section title="Opportunity">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-soft p-5">
            <p className="mb-3 text-[12.5px] text-neutral-500">Issues they're facing</p>
            <ul className="space-y-2.5">
              {issues.length ? (
                issues.map((i) => (
                  <li key={i} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                    <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" strokeWidth={1.8} />
                    {i}
                  </li>
                ))
              ) : (
                <li className="text-[13.5px] text-neutral-400">Not recorded</li>
              )}
            </ul>
          </div>
          <div className="rounded-2xl bg-brand-50 p-5">
            <p className="mb-3 text-[12.5px] text-brand-700">Our suggested solutions</p>
            <ul className="space-y-2.5">
              {solutions.length ? (
                solutions.map((s) => (
                  <li key={s} className="flex gap-2.5 text-[13.5px] leading-relaxed">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={1.8} />
                    {s}
                  </li>
                ))
              ) : (
                <li className="text-[13.5px] text-neutral-400">Not recorded</li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-3 xl:grid-cols-6">
          <Info label="Estimated value">{formatMoney(lead.estimatedValue)}</Info>
          <Info label="Lead score">
            <div className="flex items-center gap-3">
              <span className="tabular-nums">{lead.leadScore}/100</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-page">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${lead.leadScore}%` }} />
              </span>
            </div>
          </Info>
          <Info label="Source">{lead.source}</Info>
          <Info label="Added">{formatDateYear(lead.createdAt)}</Info>
          <Info label="Last contacted">{lead.lastContactedAt ? formatDateTime(lead.lastContactedAt) : "Never"}</Info>
          <Info label="Next follow-up">
            {lead.nextFollowUpAt ? (
              <span className={cn(lead.nextFollowUpAt < new Date().toISOString() && "text-[#E5484D]")}>
                {dayLabel(dayKey(lead.nextFollowUpAt))}, {formatTime(lead.nextFollowUpAt)}
              </span>
            ) : (
              "—"
            )}
          </Info>
        </div>
      </Section>

      <div className="grid gap-x-12 xl:grid-cols-2">
      <Section title="Assignment">
        {perms.assignLeads ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] text-neutral-500">Assigned rep</p>
              <Select value={lead.assignedToId ?? ""} onChange={(e) => assignLeads([lead.id], { assignedToId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {reps.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <p className="mb-2 text-[12px] text-neutral-500">Lead pool</p>
              <Select value={lead.poolId ?? ""} onChange={(e) => assignLeads([lead.id], { poolId: e.target.value || null })}>
                <option value="">No pool</option>
                {data.pools.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <Info label="Assigned rep">{userById(lead.assignedToId)?.name ?? "Unassigned"}</Info>
            <Info label="Lead pool">{pool?.name ?? "—"}</Info>
          </div>
        )}
      </Section>

      {fields.length > 0 && (
        <Section title="Custom fields">
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {fields.map((f) => (
              <Info key={f.id} label={f.name}>
                {formatCustom(f, lead.customFields[f.key])}
              </Info>
            ))}
          </div>
        </Section>
      )}
      </div>
    </div>
  );
}

function formatCustom(def: CustomFieldDef, value: CustomFieldValue | undefined) {
  if (value === null || value === undefined || value === "") return <span className="text-neutral-400">—</span>;
  if (def.type === "BOOLEAN") return value ? "Yes" : "No";
  if (def.type === "URL")
    return (
      <a className="underline-offset-4 hover:underline" href={`https://${String(value).replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer">
        {String(value)}
      </a>
    );
  return String(value);
}

function Activity({ lead }: { lead: Lead }) {
  const { data, userById, updateMeeting } = useCrm();
  const now = new Date().toISOString();
  const items = useMemo(() => {
    const calls = data.calls
      .filter((c) => c.leadId === lead.id)
      .map((c) => ({ kind: "call" as const, at: c.startedAt, call: c }));
    const meetings = data.meetings
      .filter((m) => m.leadId === lead.id)
      .map((m) => ({ kind: "meeting" as const, at: m.scheduledAt, meeting: m }));
    return [...calls, ...meetings].sort((a, b) => b.at.localeCompare(a.at));
  }, [data.calls, data.meetings, lead.id]);

  if (!items.length)
    return <p className="rounded-2xl bg-soft px-5 py-10 text-center text-[13.5px] text-neutral-500">No calls or meetings yet.</p>;

  return (
    <ol className="relative">
      {items.map((it, i) => {
        if (it.kind === "call") {
          const c = it.call;
          const talked = CONNECT_DISPOSITIONS.includes(c.disposition);
          const script = c.scriptId ? data.scripts.find((s) => s.id === c.scriptId) : undefined;
          return (
            <TimelineItem key={c.id} last={i === items.length - 1} icon={talked ? PhoneCall : PhoneMissed} tone={talked ? "ink" : "soft"}>
              <p className="text-[14px] font-medium">{DISPOSITION_LABELS[c.disposition]}</p>
              <p className="mt-1 text-[12.5px] text-neutral-500">
                {userById(c.userId)?.name ?? "—"} · {formatDateTime(c.startedAt)} · {formatDuration(c.durationSec)}
                {script ? ` · ${script.title}` : ""}
              </p>
              {c.notes && <p className="mt-2 rounded-xl bg-soft px-3.5 py-2.5 text-[13px] text-neutral-700">{c.notes}</p>}
            </TimelineItem>
          );
        }
        const m = it.meeting;
        const needsOutcome = m.status === "BOOKED" && m.scheduledAt < now;
        return (
          <TimelineItem key={m.id} last={i === items.length - 1} icon={Video} tone="brand">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[14px] font-medium">{m.title}</p>
              <StatusDot color={MEETING_STATUS_DOT[m.status]} label={MEETING_STATUS_LABELS[m.status]} className="text-[12px]" />
            </div>
            <p className="mt-1 text-[12.5px] text-neutral-500">
              {userById(m.userId)?.name ?? "—"} · {formatDateTime(m.scheduledAt)} · {m.durationMin} min
            </p>
            {needsOutcome && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => updateMeeting(m.id, { status: "SHOWED" })}>
                  Showed
                </Button>
                <Button size="sm" variant="secondary" onClick={() => updateMeeting(m.id, { status: "NO_SHOW" })}>
                  No show
                </Button>
              </div>
            )}
          </TimelineItem>
        );
      })}
    </ol>
  );
}

function TimelineItem({
  icon: Icon,
  tone,
  last,
  children,
}: {
  icon: typeof Phone;
  tone: "ink" | "soft" | "brand";
  last: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {!last && <span className="absolute left-[17px] top-10 h-[calc(100%-40px)] w-px bg-neutral-200" />}
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
          tone === "ink" && "bg-ink text-white",
          tone === "soft" && "bg-page text-neutral-500",
          tone === "brand" && "bg-brand text-brand-fg"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1 pt-1.5">{children}</div>
    </li>
  );
}

function Notes({ lead }: { lead: Lead }) {
  const { updateLead, notify, viewer } = useCrm();
  const [value, setValue] = useState(lead.notes);
  useEffect(() => setValue(lead.notes), [lead.id, lead.notes]);
  return (
    <div>
      <Textarea value={value} onChange={(e) => setValue(e.target.value)} className="min-h-[220px]" placeholder="Anything the team should know about this lead…" />
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="flex items-center gap-2 text-[12.5px] text-neutral-500">
          <Avatar name={viewer.name} size={22} /> Editing as {viewer.name}
        </span>
        <Button
          disabled={value === lead.notes}
          onClick={() => {
            updateLead(lead.id, { notes: value });
            notify("Notes saved");
          }}
        >
          Save notes
        </Button>
      </div>
    </div>
  );
}
