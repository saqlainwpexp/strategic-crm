"use client";

// One place that computes every reporting number on the Dashboard tabs, for a time range
// and an optional rep, using the viewer's role-scoped data.

import { useMemo } from "react";
import { useCrm } from "@/components/providers/CrmProvider";
import { AGENCY_SERVICES, CONNECT_DISPOSITIONS } from "@/lib/constants";
import type { CallDisposition, CallLog, User } from "@/lib/types";
import { weekdayShort, dayKey, lastMonthKeys, minuteOfDay, monthKey, monthLabel, zonedISO, shiftDayKey, todayKey, zonedParts } from "@/lib/date";
import { deltaLabel, pct, sum } from "@/lib/utils";

export type ReportRange = "today" | "7d" | "30d" | "mtd";

export const RANGE_OPTIONS: { value: ReportRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "mtd", label: "This month" },
];

export const REP_COLORS = [
  "rgb(var(--brand-500))",
  "rgb(var(--ink))",
  "rgb(var(--brand-300))",
  "rgb(var(--brand-700))",
  "#A3A3A3",
];

export const OUTCOME_GROUPS: { label: string; color: string; match: CallDisposition[] }[] = [
  { label: "Meeting booked", color: "rgb(var(--brand-700))", match: ["MEETING_BOOKED"] },
  { label: "Interested", color: "rgb(var(--brand-500))", match: ["INTERESTED"] },
  { label: "Connected", color: "rgb(var(--brand-300))", match: ["CONNECTED"] },
  { label: "Call me later", color: "rgb(var(--brand-100))", match: ["CALL_ME_LATER"] },
  { label: "Not interested / hung up", color: "rgb(var(--ink))", match: ["NOT_INTERESTED", "HUNG_UP"] },
  { label: "No answer / voicemail", color: "#D4D4D4", match: ["NO_ANSWER", "VOICEMAIL", "BUSY", "WRONG_NUMBER"] },
];

const FUNNEL: { label: string; stages: string[] }[] = [
  { label: "All leads", stages: [] },
  { label: "Contacted", stages: ["CONTACTED", "INTERESTED", "MEETING_BOOKED", "SHOWED", "NO_SHOW", "NOT_INTERESTED", "HUNG_UP", "CALL_ME_LATER", "CLOSED_WON"] },
  { label: "Interested", stages: ["INTERESTED", "MEETING_BOOKED", "SHOWED", "NO_SHOW", "CLOSED_WON"] },
  { label: "Meeting booked", stages: ["MEETING_BOOKED", "SHOWED", "NO_SHOW", "CLOSED_WON"] },
  { label: "Showed up", stages: ["SHOWED", "CLOSED_WON"] },
  { label: "Signed up", stages: ["CLOSED_WON"] },
];

export function rangeDays(range: ReportRange) {
  if (range === "mtd") return zonedParts().day;
  return range === "today" ? 1 : range === "7d" ? 7 : 30;
}

export const rangeHint = (range: ReportRange) =>
  range === "today" ? "vs yesterday" : range === "7d" ? "vs previous 7 days" : range === "mtd" ? "vs same days before" : "Last 30 days";

/** Reps the viewer can report on: themselves (sales), their team (BD) or everyone (managers). */
export function useReportReps(): User[] {
  const { data, viewer } = useCrm();
  return useMemo(() => {
    if (viewer.role === "SALES") return data.users.filter((u) => u.id === viewer.id);
    return data.users.filter(
      (u) => (u.role === "SALES" || u.role === "BD") && (viewer.role !== "BD" || u.id === viewer.id || u.reportsToId === viewer.id)
    );
  }, [data.users, viewer]);
}

export function useReport(range: ReportRange, repId: string) {
  const { data } = useCrm();
  const reps = useReportReps();

  return useMemo(() => {
    const today = todayKey();
    const nowISO = new Date().toISOString();
    const days = rangeDays(range);
    const startKey = shiftDayKey(today, -(days - 1));
    const start = zonedISO(startKey, 0);
    const prevStart = zonedISO(shiftDayKey(today, -(2 * days - 1)), 0);
    const shownReps = repId ? reps.filter((r) => r.id === repId) : reps;
    const repIds = new Set(shownReps.map((r) => r.id));
    const mine = (userId: string | null) => !!userId && repIds.has(userId);

    const calls = data.calls.filter((c) => c.startedAt >= start && mine(c.userId));
    const prevCalls = data.calls.filter((c) => c.startedAt >= prevStart && c.startedAt < start && mine(c.userId));
    const connects = (list: CallLog[]) => list.filter((c) => CONNECT_DISPOSITIONS.includes(c.disposition));
    const meetingsOf = (list: CallLog[]) => list.filter((c) => c.disposition === "MEETING_BOOKED").length;
    const shiftSecs = (from: string, to: string | null, userIds: Set<string>) =>
      sum(
        data.timeLogs
          .filter((t) => t.clockIn >= from && (!to || t.clockIn < to) && userIds.has(t.userId))
          .map((t) => Math.max(0, (new Date(t.clockOut ?? nowISO).getTime() - new Date(t.clockIn).getTime()) / 1000))
      );
    const hours = shiftSecs(start, null, repIds);
    const prevHours = shiftSecs(prevStart, start, repIds);
    const comparable = range !== "30d";
    const delta = (cur: number, prev: number) => (comparable && prev > 0 ? deltaLabel(cur, prev) : undefined);

    // Calls over time, stacked per rep
    const buckets =
      range === "today"
        ? Array.from({ length: 10 }, (_, i) => ({ key: String(10 + i), label: `${((9 + i) % 12) + 1}${10 + i < 12 ? "am" : "pm"}` }))
        : Array.from({ length: days }, (_, i) => {
            const k = shiftDayKey(startKey, i);
            return {
              key: k,
              label:
                days <= 7
                  ? weekdayShort(k)
                  : String(Number(k.slice(8))),
            };
          });
    const series = buckets.map((b) => {
      const row: Record<string, string | number> = { label: b.label };
      for (const r of shownReps) {
        row[r.id] = calls.filter(
          (c) => c.userId === r.id && (range === "today" ? String(Math.floor(minuteOfDay(c.startedAt) / 60)) === b.key : dayKey(c.startedAt) === b.key)
        ).length;
      }
      return row;
    });

    const outcomes = OUTCOME_GROUPS.map((g) => ({ ...g, value: calls.filter((c) => g.match.includes(c.disposition)).length })).filter((g) => g.value > 0);

    const scripts = data.scripts
      .map((s) => {
        const used = calls.filter((c) => c.scriptId === s.id);
        const booked = meetingsOf(used);
        return {
          script: s,
          calls: used.length,
          avgTalk: used.length ? Math.round(sum(used.map((c) => c.durationSec)) / used.length) : 0,
          meetings: booked,
          rate: pct(booked, used.length, 1),
        };
      })
      .filter((s) => s.calls > 0 || s.script.active)
      .sort((x, y) => y.calls - x.calls);

    const funnelBase = data.leads.filter((l) => mine(l.assignedToId));
    const funnel = FUNNEL.map((f) => ({
      label: f.label,
      value: f.stages.length ? funnelBase.filter((l) => f.stages.includes(l.stage)).length : funnelBase.length,
    }));

    // Money
    const paid = data.payments.filter((p) => p.status === "PAID" && p.paidAt && mine(p.userId));
    const collected = sum(paid.filter((p) => p.paidAt! >= start).map((p) => p.amount));
    const prevCollected = sum(paid.filter((p) => p.paidAt! >= prevStart && p.paidAt! < start).map((p) => p.amount));
    const due = data.payments.filter((p) => (p.status === "PENDING" || p.status === "PARTIAL") && mine(p.userId));
    const clients = data.leads.filter((l) => l.stage === "CLOSED_WON" && mine(l.assignedToId));
    const signedInRange = clients.filter((l) => l.closedAt && l.closedAt >= start);
    const months = lastMonthKeys(6);
    const cashChart = months.map((mk) => ({
      label: monthLabel(mk),
      values: Object.fromEntries(
        AGENCY_SERVICES.map((svc) => [svc, sum(paid.filter((p) => p.service === svc && monthKey(p.paidAt!) === mk).map((p) => p.amount))])
      ),
    }));

    // Per rep
    const board = shownReps
      .map((u) => {
        const own = calls.filter((c) => c.userId === u.id);
        const con = connects(own).length;
        const secs = shiftSecs(start, null, new Set([u.id]));
        return {
          user: u,
          hours: secs,
          calls: own.length,
          perHour: secs ? Math.round((own.length / (secs / 3600)) * 10) / 10 : 0,
          talk: sum(own.map((c) => c.durationSec)),
          connects: con,
          connectRate: pct(con, own.length),
          meetings: meetingsOf(own),
          signed: signedInRange.filter((l) => l.assignedToId === u.id).length,
          collected: sum(paid.filter((p) => p.userId === u.id && p.paidAt! >= start).map((p) => p.amount)),
          onShift: data.timeLogs.some((t) => t.userId === u.id && t.clockOut === null),
        };
      })
      .sort((x, y) => y.calls - x.calls);

    // Per day (newest first)
    const daily = Array.from({ length: days }, (_, i) => shiftDayKey(today, -i)).map((k) => {
      const dayCalls = calls.filter((c) => dayKey(c.startedAt) === k);
      const next = zonedISO(shiftDayKey(k, 1), 0);
      return {
        day: k,
        calls: dayCalls.length,
        connects: connects(dayCalls).length,
        talk: sum(dayCalls.map((c) => c.durationSec)),
        hours: shiftSecs(zonedISO(k, 0), next, repIds),
        meetings: meetingsOf(dayCalls),
        collected: sum(paid.filter((p) => dayKey(p.paidAt!) === k).map((p) => p.amount)),
      };
    });

    const connectRate = pct(connects(calls).length, calls.length);
    const prevConnectRate = pct(connects(prevCalls).length, prevCalls.length);

    return {
      shownReps,
      series,
      outcomes,
      scripts,
      funnel,
      board,
      daily,
      cashChart,
      totals: {
        calls: calls.length,
        callsDelta: delta(calls.length, prevCalls.length),
        connects: connects(calls).length,
        connectRate,
        connectDelta:
          comparable && prevCalls.length ? `${connectRate - prevConnectRate >= 0 ? "+" : ""}${connectRate - prevConnectRate} pts` : undefined,
        talk: sum(calls.map((c) => c.durationSec)),
        talkDelta: delta(sum(calls.map((c) => c.durationSec)), sum(prevCalls.map((c) => c.durationSec))),
        hours,
        hoursDelta: delta(hours, prevHours),
        perHour: hours ? Math.round((calls.length / (hours / 3600)) * 10) / 10 : 0,
        meetings: meetingsOf(calls),
        meetingsDelta: delta(meetingsOf(calls), meetingsOf(prevCalls)),
        leadsReached: new Set(calls.map((c) => c.leadId)).size,
        signed: signedInRange.length,
        signedValue: sum(signedInRange.map((l) => l.estimatedValue)),
        collected,
        collectedDelta: delta(collected, prevCollected),
        outstanding: sum(due.map((p) => p.amount)),
        dueCount: due.length,
        lateCount: due.filter((p) => p.dueDate < nowISO).length,
        clients: clients.length,
        collectedAllTime: sum(paid.map((p) => p.amount)),
      },
      byService: AGENCY_SERVICES.map((svc) => ({
        service: svc,
        total: sum(paid.filter((p) => p.service === svc).map((p) => p.amount)),
        clients: clients.filter((c) => c.service === svc).length,
      })),
      byRepMoney: shownReps
        .map((u) => ({
          user: u,
          total: sum(paid.filter((p) => p.userId === u.id).map((p) => p.amount)),
          inRange: sum(paid.filter((p) => p.userId === u.id && p.paidAt! >= start).map((p) => p.amount)),
          clients: clients.filter((c) => c.assignedToId === u.id).length,
        }))
        .sort((a, b) => b.total - a.total),
    };
  }, [data, range, repId, reps]);
}
