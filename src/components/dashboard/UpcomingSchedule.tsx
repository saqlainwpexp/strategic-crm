"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, FilePenLine, Phone, Plus, Rocket, Video } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { PriorityFlag } from "@/components/ui/Badges";
import { MeetingModal } from "@/components/shared/MeetingModal";
import { EmptyState } from "@/components/ui/Layout";
import { currentWeek, dayLabel, formatTime } from "@/lib/date";
import { busyDays, scheduleFor, type ScheduleEntry } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export const SCHEDULE_ICONS: Record<ScheduleEntry["icon"], typeof Phone> = {
  call: Phone,
  meeting: Video,
  proposal: FilePenLine,
  onboarding: Rocket,
};

export function UpcomingSchedule() {
  const { data, perms, userById } = useCrm();
  const router = useRouter();
  const week = useMemo(() => currentWeek(), []);
  const [selected, setSelected] = useState(week.find((d) => d.active)?.key ?? week[0].key);
  const [booking, setBooking] = useState(false);

  const entries = useMemo(() => scheduleFor(data, selected), [data, selected]);
  const busy = useMemo(() => busyDays(data, week.map((d) => d.key)), [data, week]);

  return (
    <section className="card flex h-full min-h-[420px] flex-col p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[18px] font-medium tracking-[-0.01em]">Upcoming schedule</h2>
        <button
          aria-label="Book a meeting"
          title="Book a meeting"
          onClick={() => setBooking(true)}
          className="grid h-11 w-11 place-items-center rounded-full bg-page text-ink transition-colors hover:bg-ink hover:text-white"
        >
          <Plus className="h-5 w-5" strokeWidth={1.6} />
        </button>
      </div>

      {/* Week strip */}
      <div className="mt-6 flex items-center justify-between">
        {week.map((d, i) => {
          const active = d.key === selected;
          return (
            <Fragment key={d.key}>
              {i > 0 && <span className="h-5 w-px bg-neutral-200" />}
              <button
                onClick={() => setSelected(d.key)}
                className={cn(
                  "flex w-[40px] flex-col items-center gap-1.5 rounded-full px-1 pb-2.5 pt-1 transition-colors",
                  active ? "bg-ink" : "hover:bg-page"
                )}
              >
                <span
                  className={cn(
                    "grid h-[32px] w-[32px] place-items-center rounded-full text-[13px]",
                    active ? "bg-white font-medium text-ink" : d.active ? "font-semibold text-brand" : "text-ink"
                  )}
                >
                  {d.day}
                </span>
                <span className={cn("text-[10.5px]", active ? "text-white" : "text-neutral-500")}>{d.weekday}</span>
                <span
                  className={cn(
                    "h-1 w-1 rounded-full",
                    busy.has(d.key) ? (active ? "bg-brand" : "bg-neutral-400") : "bg-transparent"
                  )}
                />
              </button>
            </Fragment>
          );
        })}
      </div>

      {/* Entries — absolutely positioned so a busy day scrolls instead of stretching the row */}
      <div className="relative mt-6 min-h-[200px] flex-1">
        <div className="scroll-slim absolute inset-0 flex flex-col gap-3 overflow-y-auto">
          {entries.length === 0 ? (
            <EmptyState
              icon={CalendarCheck2}
              title={`Nothing scheduled ${dayLabel(selected).startsWith("Today") ? "today" : "for " + dayLabel(selected)}`}
              className="py-6"
            />
          ) : (
            entries.map((e) => {
              const Icon = SCHEDULE_ICONS[e.icon];
              const rep = perms.seesTeam ? userById(e.userId)?.name.split(" ")[0] : null;
              return (
                <button
                  key={e.id}
                  onClick={() => router.push(`/leads?lead=${e.lead.id}`)}
                  className="flex w-full shrink-0 items-center gap-3.5 rounded-[26px] bg-soft py-2.5 pl-2.5 pr-5 text-left transition-colors hover:bg-neutral-100"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-black/[0.05] bg-white text-neutral-800">
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.6} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{e.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-neutral-500">
                      {e.lead.businessName}
                      {rep ? ` · ${rep}` : ""}
                    </span>
                  </span>
                  <PriorityFlag priority={e.lead.priority} className="hidden w-[74px] shrink-0 text-[11.5px] sm:inline-flex" />
                  <span className="w-[66px] shrink-0 text-right text-[12.5px] tabular-nums text-ink">{formatTime(e.at)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <MeetingModal open={booking} onClose={() => setBooking(false)} day={selected} />
    </section>
  );
}
