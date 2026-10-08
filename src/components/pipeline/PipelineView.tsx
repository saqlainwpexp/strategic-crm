"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Briefcase, CalendarCheck2, CircleCheck, Target } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { PageHeader, StatCard } from "@/components/ui/Layout";
import { FilterSelect, SearchInput } from "@/components/ui/Form";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { ScoreTag } from "@/components/ui/Badges";
import { Avatar } from "@/components/ui/Avatar";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { LeadForm } from "@/components/leads/LeadForm";
import { MeetingModal } from "@/components/shared/MeetingModal";
import { PaymentModal } from "@/components/shared/PaymentModal";
import { AGENCY_SERVICES, DEAL_STAGES, PIPELINE_STAGES, STAGE_DOT, STAGE_LABELS, type PipelineStage } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { dayKey, dayLabel, monthKey, todayKey, weekKeys } from "@/lib/date";
import { cn, compactMoney, pct, sum } from "@/lib/utils";

const PAGE = 25;

export function PipelineView() {
  const { data, perms, viewer, moveLead, leadById } = useCrm();
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [service, setService] = useState("");
  const [shown, setShown] = useState<Partial<Record<PipelineStage, number>>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [meetingFor, setMeetingFor] = useState<string | null>(null);
  const [paymentFor, setPaymentFor] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.leads.filter(
      (l) =>
        (!rep || l.assignedToId === rep) &&
        (!service || l.service === service) &&
        (!t || l.businessName.toLowerCase().includes(t) || l.decisionMakerName.toLowerCase().includes(t))
    );
  }, [data.leads, q, rep, service]);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, [] as Lead[]])) as Record<PipelineStage, Lead[]>;
    for (const l of filtered) map[l.stage].push(l);
    for (const s of PIPELINE_STAGES) map[s].sort((a, b) => b.leadScore - a.leadScore);
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    const deals = data.leads.filter((l) => DEAL_STAGES.includes(l.stage));
    const week = new Set(weekKeys(todayKey()));
    const won = data.leads.filter((l) => l.stage === "CLOSED_WON").length;
    const lost = data.leads.filter((l) => l.stage === "NOT_INTERESTED" || l.stage === "HUNG_UP").length;
    return {
      value: sum(deals.map((l) => l.estimatedValue)),
      deals: deals.length,
      meetings: data.meetings.filter((m) => m.status !== "CANCELLED" && week.has(dayKey(m.scheduledAt))).length,
      winRate: pct(won, won + lost),
      signedMonth: data.leads.filter((l) => l.closedAt && monthKey(l.closedAt) === todayKey().slice(0, 7)).length,
      won,
    };
  }, [data.leads, data.meetings]);

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const id = String(e.active.id);
    const to = e.over?.id as PipelineStage | undefined;
    const lead = leadById(id);
    if (!lead || !to || lead.stage === to) return;
    moveLead(id, to);
    if (to === "MEETING_BOOKED") setMeetingFor(id);
    if (to === "CLOSED_WON") setPaymentFor(id);
  };

  const dragged = dragId ? leadById(dragId) : undefined;
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle="Drag a lead between stages. Booking a meeting or signing a client prompts the next step."
        actions={
          <>
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads" className="h-11 w-[240px] border border-black/[0.06] bg-white" />
            {perms.seesTeam && (
              <FilterSelect value={rep} onChange={(e) => setRep(e.target.value)} active={!!rep} onPage>
                <option value="">All reps</option>
                {reps.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect value={service} onChange={(e) => setService(e.target.value)} active={!!service} onPage>
              <option value="">All services</option>
              {AGENCY_SERVICES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </FilterSelect>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Briefcase} label="Open deal value" value={compactMoney(stats.value)} hint={`${stats.deals} deals in Interested → Showed`} />
        <StatCard icon={CalendarCheck2} label="Meetings this week" value={stats.meetings} hint="Booked, held or missed" />
        <StatCard icon={Target} label="Win rate" value={`${stats.winRate}%`} hint="Signed ÷ (signed + lost)" />
        <StatCard icon={CircleCheck} label="Signed this month" value={stats.signedMonth} hint={`${stats.won} signed clients in total`} />
      </div>

      <DndContext id="pipeline-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
        <div className="scroll-slim -mx-6 mt-8 flex gap-5 overflow-x-auto px-6 pb-6 lg:-mx-10 lg:px-10">
          {PIPELINE_STAGES.map((stage) => {
            const leads = byStage[stage];
            const limit = shown[stage] ?? PAGE;
            return (
              <Column
                key={stage}
                stage={stage}
                count={leads.length}
                value={sum(leads.map((l) => l.estimatedValue))}
                dragging={!!dragId}
              >
                {leads.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-8 text-center text-[12.5px] text-neutral-400">
                    Drop leads here
                  </p>
                ) : (
                  <>
                    {leads.slice(0, limit).map((l) => (
                      <DraggableCard key={l.id} lead={l} onOpen={() => setOpenId(l.id)} showRep={perms.seesTeam} />
                    ))}
                    {leads.length > limit && (
                      <button
                        onClick={() => setShown((s) => ({ ...s, [stage]: limit + PAGE }))}
                        className="h-10 w-full rounded-full bg-page text-[12.5px] text-neutral-600 transition-colors hover:bg-neutral-200 hover:text-ink"
                      >
                        Show {Math.min(PAGE, leads.length - limit)} more
                      </button>
                    )}
                  </>
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragged ? <CardBody lead={dragged} showRep={perms.seesTeam} className="rotate-[1.5deg] shadow-2xl" /> : null}
        </DragOverlay>
      </DndContext>

      <LeadDrawer leadId={openId} onClose={() => setOpenId(null)} onEdit={setEditing} />
      <LeadForm open={!!editing} onClose={() => setEditing(null)} lead={editing} />
      <MeetingModal open={!!meetingFor} onClose={() => setMeetingFor(null)} leadId={meetingFor} />
      <PaymentModal
        open={!!paymentFor}
        onClose={() => setPaymentFor(null)}
        leadId={paymentFor}
        title={`${(paymentFor && leadById(paymentFor)?.businessName) || "Client"} signed up`}
        subtitle={`Nice work, ${viewer.name.split(" ")[0]}. Record the advance now, or skip and add it from Sales later.`}
        skipLabel="Skip for now"
      />
    </div>
  );
}

function Column({
  stage,
  count,
  value,
  dragging,
  children,
}: {
  stage: PipelineStage;
  count: number;
  value: number;
  dragging: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-[680px] w-[300px] shrink-0 flex-col rounded-[20px] bg-white p-4 transition-shadow",
        isOver ? "shadow-[0_0_0_2px_rgb(var(--brand-500))]" : dragging && "shadow-[0_0_0_1px_rgba(10,10,10,0.06)]"
      )}
    >
      <div className="flex items-center justify-between gap-3 px-1.5 pb-1 pt-1">
        <span className="flex items-center gap-2.5 text-[14px] font-medium">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: STAGE_DOT[stage] }} />
          {STAGE_LABELS[stage]}
        </span>
        <span className="rounded-full bg-page px-2.5 py-1 text-[11.5px] tabular-nums text-neutral-600">{count}</span>
      </div>
      <p className="px-1.5 pb-4 text-[12px] text-neutral-500">{compactMoney(value)} potential</p>
      <div className="scroll-slim -mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pb-1">{children}</div>
    </div>
  );
}

function DraggableCard({ lead, onOpen, showRep }: { lead: Lead; onOpen: () => void; showRep: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} className={cn("outline-none", isDragging && "opacity-35")}>
      <CardBody lead={lead} showRep={showRep} />
    </div>
  );
}

function CardBody({ lead, showRep, className }: { lead: Lead; showRep: boolean; className?: string }) {
  const { tempOf, userById } = useCrm();
  const rep = userById(lead.assignedToId);
  const overdue = lead.nextFollowUpAt && lead.nextFollowUpAt < new Date().toISOString();
  return (
    <div
      className={cn(
        "cursor-grab select-none rounded-2xl bg-soft p-4 transition-colors hover:bg-neutral-100 active:cursor-grabbing",
        className
      )}
    >
      <div className="flex items-center gap-3">
        <LeadThumb lead={lead} size={34} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-medium">{lead.businessName}</p>
          <p className="truncate text-[11.5px] text-neutral-500">{lead.city}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[12.5px]">
        <span className="text-neutral-600">{lead.service}</span>
        <span className="tabular-nums text-ink">{compactMoney(lead.estimatedValue)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-neutral-200/70 pt-3 text-[12px]">
        <ScoreTag score={lead.leadScore} temp={tempOf(lead.leadScore)} />
        <span className="flex items-center gap-2">
          {lead.nextFollowUpAt && (
            <span className={cn("text-[11.5px]", overdue ? "text-[#E5484D]" : "text-neutral-500")}>
              {dayLabel(dayKey(lead.nextFollowUpAt))}
            </span>
          )}
          {showRep && rep && <Avatar name={rep.name} size={24} />}
        </span>
      </div>
    </div>
  );
}
