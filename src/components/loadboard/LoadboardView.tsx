"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarCheck2,
  CircleAlert,
  CircleCheck,
  Globe,
  ArrowUpRight,
  Headphones,
  Inbox,
  Mail,
  PhoneCall,
  PhoneOutgoing,
  SkipForward,
  User as UserIcon,
  Video,
  Volume2,
} from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, buttonClass } from "@/components/ui/Button";
import { StatCard, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { Toggle } from "@/components/ui/Form";
import { StatsToggle, useRememberedToggle } from "@/components/ui/StatsToggle";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { PriorityFlag, ScoreTag, StageLabel } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadForm } from "@/components/leads/LeadForm";
import { ShiftPill } from "@/components/dashboard/DashboardView";
import { buildQueue, upcomingFor, QUEUE_KIND_LABELS, type QueueItem, type QueueKind } from "@/lib/queue";
import { CONNECT_DISPOSITIONS } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { dialHref } from "@/lib/dial";
import { dayKey, dayLabel, formatTime, relativeTime, todayKey } from "@/lib/date";
import { useNotificationPermission, useSoundPreference } from "@/lib/notify";
import { cn, compactMoney, formatHours, pct, sum } from "@/lib/utils";

type Filter = "all" | "callback" | "hot" | "new" | "retry";
const FILTER_KINDS: Record<Filter, QueueKind[] | null> = {
  all: null,
  callback: ["callback", "rebook"],
  hot: ["hot", "interested"],
  new: ["new"],
  retry: ["retry"],
};
const KIND_DOT: Record<QueueKind, string> = {
  callback: "#E5484D",
  rebook: "#EAB308",
  interested: "rgb(var(--brand-500))",
  hot: "rgb(var(--brand-700))",
  new: "#3B82F6",
  retry: "#A3A3A3",
};

export function LoadboardView() {
  const { data, viewer } = useCrm();
  const [now, setNow] = useState(() => Date.now());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<{ id: string; call: boolean } | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [statsOpen, toggleStats] = useRememberedToggle("scrm_stats_loadboard");

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Reps work their own queue; managers and admins see the whole team's.
  const ownsLeads = useMemo(() => data.leads.some((l) => l.assignedToId === viewer.id), [data.leads, viewer.id]);
  const ownerId = ownsLeads ? viewer.id : undefined;

  const queue = useMemo(() => buildQueue(data, { ownerId, skipped, now }), [data, ownerId, skipped, now]);
  const counts = useMemo(() => {
    const c = (kinds: QueueKind[]) => queue.filter((q) => kinds.includes(q.kind)).length;
    return { all: queue.length, callback: c(["callback", "rebook"]), hot: c(["hot", "interested"]), new: c(["new"]), retry: c(["retry"]) };
  }, [queue]);
  const visible = useMemo(() => {
    const kinds = FILTER_KINDS[filter];
    return kinds ? queue.filter((q) => kinds.includes(q.kind)) : queue;
  }, [queue, filter]);
  const upNext = visible[0];
  const rest = visible.slice(1);

  const stats = useMemo(() => {
    const today = todayKey();
    const mine = data.calls.filter((c) => dayKey(c.startedAt) === today && (!ownsLeads || c.userId === viewer.id));
    const connected = mine.filter((c) => CONNECT_DISPOSITIONS.includes(c.disposition)).length;
    return {
      calls: mine.length,
      connected,
      connectRate: pct(connected, mine.length),
      meetings: mine.filter((c) => c.disposition === "MEETING_BOOKED").length,
      talk: sum(mine.map((c) => c.durationSec)),
    };
  }, [data.calls, ownsLeads, viewer.id]);

  const callLead = useCallback((lead: Lead) => setOpen({ id: lead.id, call: true }), []);
  const skip = useCallback((id: string) => setSkipped((s) => [...s.filter((x) => x !== id), id]), []);

  // Keyboard: C call · S skip · O open (ignored while typing or with a panel open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!upNext || open || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        window.location.href = dialHref(upNext.lead.phone, data.settings.dialerScheme);
        callLead(upNext.lead);
      } else if (k === "s") skip(upNext.lead.id);
      else if (k === "o") setOpen({ id: upNext.lead.id, call: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [upNext, open, data.settings.dialerScheme, callLead, skip]);

  return (
    <div className="pt-6">
      {statsOpen && (
      <div className="animate-fade-in mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={PhoneOutgoing} label={ownsLeads ? "My calls today" : "Team calls today"} value={stats.calls} hint="Every dial counts" />
        <StatCard icon={PhoneCall} label="Connected" value={stats.connected} hint={`${stats.connectRate}% connect rate`} />
        <StatCard icon={CalendarCheck2} label="Meetings booked" value={stats.meetings} hint="From today's calls" />
        <StatCard icon={Headphones} label="Talk time" value={formatHours(stats.talk)} hint="Time on the phone today" />
      </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_390px]">
        <div className="flex min-w-0 flex-col gap-6">
          {upNext ? (
            <UpNext item={upNext} position={1} total={visible.length} showRep={!ownsLeads} onCall={callLead} onSkip={skip} onOpen={(id) => setOpen({ id, call: false })} />
          ) : (
            <Card className="p-8">
              <EmptyState
                icon={CircleCheck}
                title={filter === "all" ? "Queue is clear" : "Nothing in this view"}
                body={
                  filter === "all"
                    ? "Everyone has been called recently or has a callback scheduled for later. New leads and callbacks will appear here."
                    : "Try another filter to see the rest of the queue."
                }
                action={filter !== "all" ? <Button variant="secondary" onClick={() => setFilter("all")}>Show all</Button> : undefined}
              />
            </Card>
          )}

          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
              <div>
                <h2 className="text-[18px] font-medium tracking-[-0.01em]">Queue</h2>
                <p className="mt-1.5 text-[13px] text-neutral-500">Who comes after — callbacks first, then interested, hot and new leads.</p>
              </div>
              <Segmented
                value={filter}
                onChange={(f) => {
                  setFilter(f);
                  setShowAll(false);
                }}
                options={[
                  { value: "all", label: "All", count: counts.all },
                  { value: "callback", label: "Callbacks", count: counts.callback },
                  { value: "hot", label: "Hot", count: counts.hot },
                  { value: "new", label: "New", count: counts.new },
                  { value: "retry", label: "Retry", count: counts.retry },
                ]}
              />
            </div>
            {rest.length === 0 ? (
              <EmptyState icon={Inbox} title="No one else waiting" className="pb-12 pt-4" />
            ) : (
              <>
                <ol>
                  {(showAll ? rest : rest.slice(0, 12)).map((q, i) => (
                    <QueueRow key={q.lead.id} item={q} position={i + 2} showRep={!ownsLeads} onOpen={() => setOpen({ id: q.lead.id, call: false })} onCall={() => callLead(q.lead)} />
                  ))}
                </ol>
                {rest.length > 12 && (
                  <div className="border-t border-neutral-100 px-7 py-4 text-center">
                    <Button variant="link" size="sm" onClick={() => setShowAll((s) => !s)}>
                      {showAll ? "Show fewer" : `Show all ${rest.length} in queue`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 xl:sticky xl:top-[116px] xl:self-start">
          <div className="flex flex-wrap items-center gap-3">
            <StatsToggle open={statsOpen} onToggle={toggleStats} label="Today's stats" />
            {(viewer.role === "SALES" || viewer.role === "BD") && <ShiftPill />}
          </div>
          <FollowUps ownerId={ownerId} now={now} onOpen={(id, call) => setOpen({ id, call })} />
          <ReminderSettings />
        </aside>
      </div>

      <LeadDrawer
        leadId={open?.id ?? null}
        startCall={open?.call}
        onClose={() => setOpen(null)}
        onEdit={setEditing}
        afterCall={() => setOpen(null)}
      />
      <LeadForm open={!!editing} onClose={() => setEditing(null)} lead={editing} />
    </div>
  );
}

function UpNext({
  item,
  position,
  total,
  showRep,
  onCall,
  onSkip,
  onOpen,
}: {
  item: QueueItem;
  position: number;
  total: number;
  showRep: boolean;
  onCall: (lead: Lead) => void;
  onSkip: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const { data, userById, tempOf } = useCrm();
  const { lead } = item;
  const issues = lead.issues.split("\n").filter(Boolean).slice(0, 2);
  const solutions = lead.suggestedServices.split("\n").filter(Boolean).slice(0, 2);
  const rep = userById(lead.assignedToId);

  return (
    <Card className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-2 rounded-full bg-ink px-3.5 text-[12.5px] text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            Up next
          </span>
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3.5 text-[12.5px]",
              item.kind === "callback" ? "bg-rose-50 text-[#C9373C]" : "bg-brand-50 text-brand-700"
            )}
          >
            {item.reason}
          </span>
        </div>
        <span className="text-[12.5px] tabular-nums text-neutral-500">
          {position} of {total} in queue
        </span>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_230px]">
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <LeadThumb lead={lead} size={58} />
            <div className="min-w-0">
              <h2 className="truncate text-[28px] font-normal leading-tight tracking-[-0.02em]">{lead.businessName}</h2>
              <p className="mt-1 truncate text-[13.5px] text-neutral-500">{lead.address}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 text-[14px]">
            <span className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-neutral-500" strokeWidth={1.7} />
              {lead.decisionMakerName || "—"}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <PhoneCall className="h-4 w-4 text-neutral-500" strokeWidth={1.7} />
              {lead.phone}
            </span>
            {lead.email && (
              <span className="flex min-w-0 items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={1.7} />
                <span className="truncate">{lead.email}</span>
              </span>
            )}
            <span className="flex min-w-0 items-center gap-2">
              <Globe className="h-4 w-4 shrink-0 text-neutral-500" strokeWidth={1.7} />
              {lead.website ? (
                <a
                  href={`https://${lead.website.replace(/^https?:\/\//, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 truncate underline-offset-4 hover:underline"
                >
                  <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                </a>
              ) : (
                <span className="text-neutral-400">No website</span>
              )}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Fact label={lead.service} value={compactMoney(lead.estimatedValue)} />
            <Fact label="Lead score" value={<ScoreTag score={lead.leadScore} temp={tempOf(lead.leadScore)} />} />
            <Fact label="Priority" value={<PriorityFlag priority={lead.priority} className="text-[14px]" />} />
            <Fact
              label={item.attempts ? `${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : "Stage"}
              value={lead.lastContactedAt ? `Last ${relativeTime(lead.lastContactedAt)}` : <StageLabel stage={lead.stage} className="text-[14px]" />}
            />
          </div>

          {(issues.length > 0 || solutions.length > 0) && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-soft p-4">
                <p className="mb-2 text-[12px] text-neutral-500">Issues</p>
                {issues.map((i) => (
                  <p key={i} className="flex gap-2 text-[13px] leading-relaxed">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400" /> {i}
                  </p>
                ))}
              </div>
              <div className="rounded-2xl bg-brand-50 p-4">
                <p className="mb-2 text-[12px] text-brand-700">Pitch</p>
                {solutions.map((s) => (
                  <p key={s} className="flex gap-2 text-[13px] leading-relaxed">
                    <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" /> {s}
                  </p>
                ))}
              </div>
            </div>
          )}
          {lead.notes && <p className="mt-4 line-clamp-2 text-[13px] text-neutral-600">“{lead.notes.split("\n")[0]}”</p>}
        </div>

        <div className="flex flex-col gap-2.5 lg:justify-end">
          {showRep && rep && (
            <span className="mb-2 flex items-center gap-2.5 text-[13px] text-neutral-600">
              <Avatar name={rep.name} size={26} /> Assigned to {rep.name.split(" ")[0]}
            </span>
          )}
          <a href={dialHref(lead.phone, data.settings.dialerScheme)} onClick={() => onCall(lead)} className={buttonClass("brand", "lg", "h-14 w-full text-[15px]")}>
            <PhoneCall className="h-[18px] w-[18px]" />
            Call now
          </a>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => onSkip(lead.id)}>
            <SkipForward className="h-4 w-4" /> Skip for now
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => onOpen(lead.id)}>
            Open lead
          </Button>
          <p className="mt-1 text-center text-[11.5px] text-neutral-400">
            Keys: <Kbd>C</Kbd> call · <Kbd>S</Kbd> skip · <Kbd>O</Kbd> open
          </p>
        </div>
      </div>
    </Card>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md bg-page px-1.5 py-0.5 font-sans text-[11px] text-neutral-600">{children}</kbd>;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-soft px-4 py-3.5">
      <p className="text-[11.5px] text-neutral-500">{label}</p>
      <div className="mt-1.5 truncate text-[14px] text-ink">{value}</div>
    </div>
  );
}

function QueueRow({
  item,
  position,
  showRep,
  onOpen,
  onCall,
}: {
  item: QueueItem;
  position: number;
  showRep: boolean;
  onOpen: () => void;
  onCall: () => void;
}) {
  const { data, userById, tempOf } = useCrm();
  const { lead } = item;
  const rep = userById(lead.assignedToId);
  return (
    <li
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-4 border-t border-neutral-100 px-7 py-4 transition-colors hover:bg-neutral-50/80"
    >
      <span className="w-6 shrink-0 text-right text-[12.5px] tabular-nums text-neutral-400">{position}</span>
      <LeadThumb lead={lead} size={38} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{lead.businessName}</p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-neutral-500">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: KIND_DOT[item.kind] }} />
          <span className="truncate">{item.reason}</span>
        </p>
      </div>
      <span className="hidden w-[110px] shrink-0 text-[12.5px] text-neutral-600 md:block">{lead.service}</span>
      <span className="hidden w-[80px] shrink-0 text-[13px] sm:block">
        <ScoreTag score={lead.leadScore} temp={tempOf(lead.leadScore)} />
      </span>
      {showRep && rep && (
        <span className="hidden shrink-0 lg:block">
          <Avatar name={rep.name} size={26} />
        </span>
      )}
      <span className="hidden w-[84px] shrink-0 text-[12px] text-neutral-500 2xl:block">{QUEUE_KIND_LABELS[item.kind]}</span>
      <a
        href={dialHref(lead.phone, data.settings.dialerScheme)}
        onClick={(e) => {
          e.stopPropagation();
          onCall();
        }}
        aria-label={`Call ${lead.businessName}`}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition-transform hover:scale-105"
      >
        <PhoneCall className="h-4 w-4" />
      </a>
    </li>
  );
}

function FollowUps({ ownerId, now, onOpen }: { ownerId?: string; now: number; onOpen: (id: string, call: boolean) => void }) {
  const { data, userById } = useCrm();
  const items = useMemo(() => upcomingFor(data, { ownerId, now, days: 7 }), [data, ownerId, now]);
  const soonMs = data.settings.reminderMinutes * 60 * 1000;
  const groups = useMemo(() => {
    const out: { day: string; items: typeof items }[] = [];
    for (const it of items.slice(0, 14)) {
      const day = dayKey(it.at);
      const g = out.find((x) => x.day === day);
      if (g) g.items.push(it);
      else out.push({ day, items: [it] });
    }
    return out;
  }, [items]);

  return (
    <Card className="p-6">
      <CardHeader
        title="Upcoming follow-ups"
        subtitle={items.length ? `${items.length} in the next 7 days` : "Nothing scheduled this week"}
        className="mb-5"
        actions={
          <Link href="/schedule" className="text-[12.5px] text-neutral-500 underline-offset-4 hover:text-ink hover:underline">
            Schedule
          </Link>
        }
      />
      {groups.length === 0 ? (
        <p className="rounded-2xl bg-soft px-4 py-8 text-center text-[13px] text-neutral-500">
          Callbacks you schedule (“Call me later”) and booked meetings show up here.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.day}>
              <p className="mb-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-neutral-400">{dayLabel(g.day)}</p>
              <div className="flex flex-col gap-2">
                {g.items.map((it) => {
                  const at = new Date(it.at).getTime();
                  const soon = at - now <= soonMs && at - now > -5 * 60 * 1000;
                  const Icon = it.kind === "meeting" ? Video : PhoneCall;
                  const rep = ownerId ? null : userById(it.userId);
                  return (
                    <div
                      key={it.id}
                      onClick={() => onOpen(it.lead.id, false)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition-colors",
                        soon ? "bg-brand-50 hover:bg-brand-100" : "bg-soft hover:bg-neutral-100"
                      )}
                    >
                      <span className="w-[58px] shrink-0">
                        <span className="block text-[13px] font-medium tabular-nums">{formatTime(it.at)}</span>
                        <span suppressHydrationWarning className={cn("block text-[11px]", soon ? "text-brand-700" : "text-neutral-500")}>
                          {relativeTime(it.at, now)}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 truncate text-[13px]">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-neutral-500" strokeWidth={1.8} />
                          <span className="truncate">{it.lead.businessName}</span>
                        </span>
                        <span className="block truncate text-[11.5px] text-neutral-500">
                          {it.title}
                          {rep ? ` · ${rep.name.split(" ")[0]}` : ""}
                        </span>
                      </span>
                      {it.kind === "followup" && (
                        <a
                          href={dialHref(it.lead.phone, data.settings.dialerScheme)}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpen(it.lead.id, true);
                          }}
                          aria-label={`Call ${it.lead.businessName}`}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-ink shadow-[0_0_0_1px_rgba(10,10,10,0.06)] hover:bg-ink hover:text-white"
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReminderSettings() {
  const { data } = useCrm();
  const { permission, request } = useNotificationPermission();
  const [sound, setSound] = useSoundPreference();
  return (
    <Card className="p-6">
      <div className="flex items-start gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-page">
          <BellRing className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </span>
        <div>
          <p className="text-[15px] font-medium">Reminders</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-500">
            You'll get an alert {data.settings.reminderMinutes} minutes before each follow-up and meeting, and again when it's due.
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3">
          <span className="text-[13px]">Desktop alerts</span>
          {permission === "granted" ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-[#1F9D4C]">
              <CircleCheck className="h-4 w-4" /> On
            </span>
          ) : permission === "denied" ? (
            <span className="text-[12px] text-neutral-500">Blocked in browser settings</span>
          ) : permission === "unsupported" ? (
            <span className="text-[12px] text-neutral-500">Not supported here</span>
          ) : (
            <Button size="sm" onClick={request}>
              Turn on
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3">
          <span className="flex items-center gap-2 text-[13px]">
            <Volume2 className="h-4 w-4 text-neutral-500" /> Sound
          </span>
          <Toggle checked={sound} onChange={setSound} />
        </div>
      </div>
      <p className="mt-4 text-[11.5px] leading-relaxed text-neutral-400">Keep this tab open while you're on shift so reminders can reach you.</p>
    </Card>
  );
}
