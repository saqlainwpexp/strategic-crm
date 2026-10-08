"use client";

import { useEffect, useMemo, useState } from "react";
import { PhoneOff, RotateCcw } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { ScriptText, scriptVars } from "@/components/scripts/ScriptText";
import { DISPOSITIONS, DISPOSITION_LABELS, DISPOSITION_TO_STAGE, STAGE_LABELS } from "@/lib/constants";
import type { CallDisposition, Lead } from "@/lib/types";
import { dialHref } from "@/lib/dial";
import { tzAbbrev, zonedISO, shiftDayKey, todayKey, weekdayOf } from "@/lib/date";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

function tomorrowKey() {
  const k = shiftDayKey(todayKey(), 1);
  return weekdayOf(k) === 6 ? shiftDayKey(k, 1) : k;
}

export function CallPanel({
  lead,
  onDone,
  onBookMeeting,
  onSaved,
}: {
  lead: Lead;
  onDone: () => void;
  onBookMeeting: () => void;
  /** Called after a call is logged (not when discarded). */
  onSaved?: (disposition: CallDisposition) => void;
}) {
  const { data, viewer, logCall } = useCrm();
  const { branding } = useBranding();
  const [startedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState(false);
  const [disposition, setDisposition] = useState<CallDisposition | null>(null);
  const activeScripts = data.scripts.filter((s) => s.active);
  const [scriptId, setScriptId] = useState<string>(
    () => activeScripts.find((s) => s.category === lead.service)?.id ?? activeScripts[0]?.id ?? ""
  );
  const [notes, setNotes] = useState("");
  const [fuDate, setFuDate] = useState(tomorrowKey());
  const [fuTime, setFuTime] = useState("12:00");

  useEffect(() => {
    if (ended) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [ended, startedAt]);

  const script = activeScripts.find((s) => s.id === scriptId);
  const vars = useMemo(() => scriptVars(lead, viewer, branding.agencyName), [lead, viewer, branding.agencyName]);
  const nextStage = disposition ? DISPOSITION_TO_STAGE[disposition] : null;

  const save = () => {
    if (!disposition) return;
    const [h, m] = fuTime.split(":").map(Number);
    logCall({
      leadId: lead.id,
      durationSec: Math.max(1, elapsed),
      disposition,
      scriptId: scriptId || null,
      notes: notes.trim(),
      followUpAt: disposition === "CALL_ME_LATER" ? zonedISO(fuDate, h, m) : undefined,
    });
    if (disposition === "MEETING_BOOKED") onBookMeeting();
    onDone();
    onSaved?.(disposition);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
      {/* Left: live call + script */}
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-ink px-6 py-5 text-white">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] text-white/60">
              <span className={cn("h-2 w-2 rounded-full", ended ? "bg-white/40" : "animate-pulse bg-[#22C55E]")} />
              {ended ? "Call ended" : "Calling via Zoom Phone"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-[32px] font-light tabular-nums leading-none tracking-[-0.02em]">{clock(elapsed)}</span>
              <span className="truncate text-[13px] text-white/70">
                {lead.decisionMakerName} · {lead.phone}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={dialHref(lead.phone, data.settings.dialerScheme)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[13px] transition-colors hover:bg-white/20"
            >
              <RotateCcw className="h-4 w-4" /> Redial
            </a>
            {!ended && (
              <button
                onClick={() => setEnded(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#E5484D] px-4 text-[13px] transition-colors hover:bg-[#d23c41]"
              >
                <PhoneOff className="h-4 w-4" /> End call
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] font-medium">Script</p>
          <Select value={scriptId} onChange={(e) => setScriptId(e.target.value)} className="w-[280px] max-w-[60%]">
            {activeScripts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </Select>
        </div>
        {/* Script fills the remaining viewport height so the whole call fits on screen */}
        <div className="scroll-slim max-h-[calc(100vh-400px)] min-h-[220px] overflow-y-auto rounded-2xl bg-soft px-6 py-5">
          {script ? <ScriptText body={script.body} vars={vars} /> : <p className="text-[13px] text-neutral-500">No active scripts.</p>}
        </div>
      </div>

      {/* Right: outcome, follow-up, notes, save */}
      <div className="flex min-w-0 flex-col gap-5">
        <div>
          <p className="mb-3 text-[13px] font-medium">Call outcome</p>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
            {DISPOSITIONS.map((d) => (
              <button
                key={d}
                onClick={() => setDisposition(d)}
                className={cn(
                  "h-10 rounded-full px-3 text-[12.5px] transition-colors",
                  disposition === d ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200/80"
                )}
              >
                {DISPOSITION_LABELS[d]}
              </button>
            ))}
          </div>
          <p className="mt-3 min-h-[18px] text-[12.5px] text-neutral-500">
            {disposition ? (
              <>
                {nextStage ? (
                  <>
                    Lead moves to <span className="text-ink">{STAGE_LABELS[nextStage]}</span>.
                  </>
                ) : (
                  "Stage stays the same — logged as an attempt."
                )}
                {disposition === "MEETING_BOOKED" && " You'll pick the meeting time next."}
              </>
            ) : (
              "Pick what happened on the call."
            )}
          </p>
        </div>

        {disposition === "CALL_ME_LATER" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Call back on">
              <Input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)} />
            </Field>
            <Field label={`At (${tzAbbrev()})`}>
              <Input type="time" value={fuTime} onChange={(e) => setFuTime(e.target.value)} />
            </Field>
          </div>
        )}

        <Field label="Notes" className="flex-1">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did they say? Objections, budget, best time…"
            className="min-h-[110px] flex-1"
          />
        </Field>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onDone}>
            Discard
          </Button>
          <Button onClick={save} disabled={!disposition}>
            {disposition === "MEETING_BOOKED" ? "Save & book meeting" : "Save call"}
          </Button>
        </div>
      </div>
    </div>
  );
}
