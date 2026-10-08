"use client";

import { useEffect, useMemo, useState } from "react";
import { useCrm } from "@/components/providers/CrmProvider";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { LeadPicker } from "./LeadPicker";
import { MEETING_TYPE_LABELS } from "@/lib/constants";
import type { MeetingType } from "@/lib/types";
import { tzAbbrev, zonedISO, shiftDayKey, todayKey, weekdayOf } from "@/lib/date";

function defaultDay() {
  const tomorrow = shiftDayKey(todayKey(), 1);
  return weekdayOf(tomorrow) === 6 ? shiftDayKey(tomorrow, 1) : tomorrow;
}

export function MeetingModal({
  open,
  onClose,
  leadId,
  day,
}: {
  open: boolean;
  onClose: () => void;
  leadId?: string | null;
  day?: string;
}) {
  const { data, viewer, perms, addMeeting, userById } = useCrm();
  const [lead, setLead] = useState<string | null>(leadId ?? null);
  const [type, setType] = useState<MeetingType>("DISCOVERY");
  const [date, setDate] = useState(day ?? defaultDay());
  const [time, setTime] = useState("15:00");
  const [duration, setDuration] = useState("30");
  const [owner, setOwner] = useState<string>(viewer.id);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLead(leadId ?? null);
    setDate(day ?? defaultDay());
    setNotes("");
  }, [open, leadId, day]);

  // Default the owner to the lead's rep.
  useEffect(() => {
    const l = lead ? data.leads.find((x) => x.id === lead) : undefined;
    setOwner(l?.assignedToId ?? viewer.id);
  }, [lead, data.leads, viewer.id]);

  const leads = useMemo(
    () =>
      data.leads
        .filter((l) => l.stage !== "NOT_INTERESTED")
        .sort((a, b) => b.leadScore - a.leadScore),
    [data.leads]
  );
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");

  const submit = () => {
    if (!lead) return;
    const [h, m] = time.split(":").map(Number);
    addMeeting({
      leadId: lead,
      userId: owner,
      title: MEETING_TYPE_LABELS[type],
      type,
      scheduledAt: zonedISO(date, h, m),
      durationMin: Number(duration),
      status: "BOOKED",
      notes,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Book a meeting"
      subtitle="Adds the meeting to the schedule and moves the lead to Meeting Booked."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!lead}>
            Book meeting
          </Button>
        </>
      }
    >
      <div className="grid gap-6">
        <Field label="Lead" required>
          <LeadPicker leads={leads} value={lead} onChange={setLead} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Meeting type">
            <Select value={type} onChange={(e) => setType(e.target.value as MeetingType)}>
              {Object.entries(MEETING_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration">
            <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
              {["15", "30", "45", "60"].map((d) => (
                <option key={d} value={d}>
                  {d} minutes
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" hint={`Agency time (${tzAbbrev()})`}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {perms.seesTeam && (
          <Field label="Taken by">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {[viewer, ...reps.filter((r) => r.id !== viewer.id)].map((u) => (
                <option key={u.id} value={u.id}>
                  {userById(u.id)?.name ?? u.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Notes">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, links, what to prepare…" />
        </Field>
      </div>
    </Modal>
  );
}
