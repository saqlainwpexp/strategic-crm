"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, CalendarCheck2, CalendarPlus, ChevronLeft, ChevronRight, PhoneCall, Video, Eye } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/Layout";
import { Avatar } from "@/components/ui/Avatar";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { StatusDot } from "@/components/ui/Badges";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadForm } from "@/components/leads/LeadForm";
import { MeetingModal } from "@/components/shared/MeetingModal";
import { SCHEDULE_ICONS } from "@/components/dashboard/UpcomingSchedule";
import { MEETING_STATUS_DOT, MEETING_STATUS_LABELS, OPEN_STAGES } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { scheduleFor } from "@/lib/schedule";
import { dayKey, formatDate, formatTime, pktISO, relativeTime, shiftDayKey, todayKey, weekKeys } from "@/lib/date";
import { dialHref } from "@/lib/dial";
import { cn, pct } from "@/lib/utils";

export function ScheduleView() {
  const { data, perms, userById, updateMeeting } = useCrm();
  const today = todayKey();
  const [offset, setOffset] = useState(0);
  const [openLead, setOpenLead] = useState<{ id: string; call?: boolean } | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [booking, setBooking] = useState<{ day?: string } | null>(null);

  const days = useMemo(() => weekKeys(shiftDayKey(today, offset * 7)), [today, offset]);
  const columns = useMemo(() => days.map((d) => ({ key: d, entries: scheduleFor(data, d) })), [data, days]);
  const now = new Date().toISOString();

  const stats = useMemo(() => {
    const todays = scheduleFor(data, today);
    const startOfToday = pktISO(today, 0);
    const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const held = data.meetings.filter((m) => m.scheduledAt >= monthAgo && m.scheduledAt < now);
    const showed = held.filter((m) => m.status === "SHOWED").length;
    const missed = held.filter((m) => m.status === "NO_SHOW").length;
    const overdue = data.leads
      .filter((l) => l.nextFollowUpAt && l.nextFollowUpAt < startOfToday && OPEN_STAGES.includes(l.stage))
      .sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!));
    return {
      meetingsToday: todays.filter((e) => e.kind === "meeting").length,
      followupsToday: todays.filter((e) => e.kind === "followup").length,
      overdue,
      showRate: pct(showed, showed + missed),
      held: showed + missed,
    };
  }, [data, today, now]);

  const rangeLabel = `${formatDate(pktISO(days[0], 12))} – ${formatDate(pktISO(days[6], 12))}`;

  return (
    <div>
      <PageHeader
        title="Schedule"
        subtitle={perms.seesTeam ? "Meetings and follow-up calls across your team." : "Your meetings and follow-up calls."}
        actions={
          <>
            <div className="flex h-12 items-center gap-1 rounded-full border border-black/[0.06] bg-white p-1">
              <IconButton label="Previous week" size="md" variant="ghost" className="bg-transparent" onClick={() => setOffset((o) => o - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <button
                onClick={() => setOffset(0)}
                className={cn("h-10 rounded-full px-4 text-[13.5px] tabular-nums", offset === 0 ? "bg-ink text-white" : "hover:bg-page")}
              >
                {offset === 0 ? "This week" : rangeLabel}
              </button>
              <IconButton label="Next week" size="md" variant="ghost" className="bg-transparent" onClick={() => setOffset((o) => o + 1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
            <Button size="lg" onClick={() => setBooking({})}>
              <CalendarPlus className="h-4 w-4" /> Book meeting
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Video} label="Meetings today" value={stats.meetingsToday} hint="Discovery, proposal & onboarding" />
        <StatCard icon={PhoneCall} label="Follow-ups today" value={stats.followupsToday} hint="Callbacks leads asked for" />
        <StatCard icon={AlarmClock} label="Overdue follow-ups" value={stats.overdue.length} hint="From earlier days" />
        <StatCard icon={Eye} label="Show rate" value={`${stats.showRate}%`} hint={`${stats.held} meetings in the last 30 days`} />
      </div>

      {/* Week board */}
      <Card className="mt-6 p-0">
        <div className="scroll-slim overflow-x-auto">
          <div className="grid min-w-[1180px] grid-cols-7">
            {columns.map(({ key, entries }, i) => {
              const isToday = key === today;
              return (
                <div key={key} className={cn("flex min-h-[560px] flex-col p-4", i > 0 && "border-l border-neutral-100")}>
                  <div className="mb-4 flex items-center justify-between px-1 pt-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "grid h-10 w-10 place-items-center rounded-full text-[14px] tabular-nums",
                          isToday ? "bg-ink text-white" : "bg-page text-ink"
                        )}
                      >
                        {Number(key.slice(8))}
                      </span>
                      <div>
                        <p className="text-[13.5px] font-medium">
                          {new Date(pktISO(key, 12)).toLocaleDateString("en-US", { weekday: "short", timeZone: "Asia/Karachi" })}
                        </p>
                        <p className="text-[11.5px] text-neutral-500">{entries.length ? `${entries.length} item${entries.length > 1 ? "s" : ""}` : "Free"}</p>
                      </div>
                    </div>
                    <button
                      aria-label={`Book on ${key}`}
                      title="Book a meeting"
                      onClick={() => setBooking({ day: key })}
                      className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-page hover:text-ink"
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    {entries.map((e) => {
                      const Icon = SCHEDULE_ICONS[e.icon];
                      const rep = userById(e.userId);
                      const needsOutcome = e.meeting && e.meeting.status === "BOOKED" && e.at < now;
                      const late = e.kind === "followup" && e.at < now;
                      return (
                        <div
                          key={e.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenLead({ id: e.lead.id })}
                          onKeyDown={(ev) => ev.key === "Enter" && setOpenLead({ id: e.lead.id })}
                          className={cn(
                            "cursor-pointer rounded-2xl p-3.5 text-left transition-colors",
                            e.kind === "meeting" ? "bg-brand-50 hover:bg-brand-100" : "bg-soft hover:bg-neutral-100"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn("text-[12px] tabular-nums", late ? "text-[#E5484D]" : "text-neutral-600")}>{formatTime(e.at)}</span>
                            <Icon className={cn("h-3.5 w-3.5", e.kind === "meeting" ? "text-brand-700" : "text-neutral-500")} strokeWidth={1.8} />
                          </div>
                          <p className="mt-2 truncate text-[13px] font-medium">{e.title}</p>
                          <p className="mt-0.5 truncate text-[11.5px] text-neutral-500">{e.lead.businessName}</p>
                          {(perms.seesTeam || e.meeting) && (
                            <div className="mt-3 flex items-center justify-between gap-2">
                              {e.meeting ? (
                                <StatusDot color={MEETING_STATUS_DOT[e.meeting.status]} label={MEETING_STATUS_LABELS[e.meeting.status]} className="text-[11.5px]" />
                              ) : (
                                <span />
                              )}
                              {perms.seesTeam && rep && <Avatar name={rep.name} size={22} />}
                            </div>
                          )}
                          {needsOutcome && (
                            <div className="mt-3 flex gap-1.5" onClick={(ev) => ev.stopPropagation()}>
                              <button
                                onClick={() => updateMeeting(e.meeting!.id, { status: "SHOWED" })}
                                className="h-7 flex-1 rounded-full bg-ink text-[11.5px] text-white hover:bg-ink-muted"
                              >
                                Showed
                              </button>
                              <button
                                onClick={() => updateMeeting(e.meeting!.id, { status: "NO_SHOW" })}
                                className="h-7 flex-1 rounded-full bg-white text-[11.5px] text-ink hover:bg-neutral-50"
                              >
                                No show
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Overdue */}
      <Card className="mt-6">
        <CardHeader
          title="Overdue follow-ups"
          subtitle="Leads that asked for a callback on an earlier day."
          actions={
            stats.overdue.length > 0 && (
              <Link href="/leads?view=due" className="text-[13px] text-neutral-600 underline-offset-4 hover:text-ink hover:underline">
                Open in Leads
              </Link>
            )
          }
        />
        {stats.overdue.length === 0 ? (
          <EmptyState icon={CalendarCheck2} title="No overdue follow-ups" body="Every callback has been made on time." className="py-8" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {stats.overdue.slice(0, 10).map((l) => {
              const rep = userById(l.assignedToId);
              return (
                <div key={l.id} className="flex items-center gap-4 rounded-2xl bg-soft p-4">
                  <LeadThumb lead={l} />
                  <button className="min-w-0 flex-1 text-left" onClick={() => setOpenLead({ id: l.id })}>
                    <p className="truncate text-[14px] font-medium">{l.businessName}</p>
                    <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                      Due {relativeTime(l.nextFollowUpAt!)} · {dayKey(l.nextFollowUpAt!) === shiftDayKey(today, -1) ? "yesterday" : formatDate(l.nextFollowUpAt!)} {formatTime(l.nextFollowUpAt!)}
                      {perms.seesTeam && rep ? ` · ${rep.name.split(" ")[0]}` : ""}
                    </p>
                  </button>
                  <a
                    href={dialHref(l.phone, data.settings.dialerScheme)}
                    onClick={() => setOpenLead({ id: l.id, call: true })}
                    aria-label={`Call ${l.businessName}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-brand-fg transition-transform hover:scale-105"
                  >
                    <PhoneCall className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <LeadDrawer leadId={openLead?.id ?? null} startCall={openLead?.call} onClose={() => setOpenLead(null)} onEdit={setEditing} />
      <LeadForm open={!!editing} onClose={() => setEditing(null)} lead={editing} />
      <MeetingModal open={!!booking} onClose={() => setBooking(null)} day={booking?.day} />
    </div>
  );
}
