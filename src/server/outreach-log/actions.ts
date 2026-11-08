"use server";

// Server actions for the Outreach & Jobs log pages. Errors come back as { error } so the
// client can show them without a crash screen.

import { requireActionUser } from "../session";
import * as svc from "./service";
import type { ContactEvent, ContactStage, JobEvent, JobStage } from "@/lib/outreach-log/constants";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function run<T>(work: (me: Awaited<ReturnType<typeof requireActionUser>>) => Promise<T>): Promise<Result<T>> {
  try {
    const me = await requireActionUser();
    return { ok: true, data: JSON.parse(JSON.stringify(await work(me))) as T };
  } catch (e) {
    if (e instanceof svc.LogError || (e instanceof Error && /session has ended/.test(e.message))) return { ok: false, error: e.message };
    console.error("[outreach-log]", e);
    return { ok: false, error: "Couldn't save that — try again." };
  }
}

const date = (v?: string | null) => (v ? new Date(v) : undefined);

export const saveLogAccount = async (input: Parameters<typeof svc.saveAccount>[1]) => run((me) => svc.saveAccount(me, input));
export const deleteLogAccount = async (id: string) => run((me) => svc.deleteAccount(me, id));

export const createLogContact = async (input: svc.ContactInput & { firstMessage?: string; logSent?: boolean }) =>
  run(async (me) => {
    const c = await svc.createContact(me, input);
    if (input.logSent) return (await svc.logContactEvent(me, c.id, "sent", { text: input.firstMessage, accountId: input.accountId })).contact;
    return c;
  });
export const updateLogContact = async (id: string, input: Partial<svc.ContactInput>) => run((me) => svc.updateContact(me, id, input));
export const deleteLogContact = async (id: string) => run((me) => svc.deleteContact(me, id));
export const logContactTouch = async (id: string, ev: ContactEvent, input: { text?: string; accountId?: string | null; at?: string }) =>
  run((me) => svc.logContactEvent(me, id, ev, { ...input, at: date(input.at) }));
export const setLogContactStage = async (id: string, stage: ContactStage, input: { note?: string; meetingAt?: string } = {}) =>
  run((me) => svc.setContactStage(me, id, stage, { note: input.note, meetingAt: date(input.meetingAt) }));
export const setLogContactFollowup = async (id: string, when: string | null) => run((me) => svc.setContactFollowup(me, id, when ? new Date(when) : null));

export const createJobApplication = async (input: Omit<svc.JobInput, "appliedAt"> & { appliedAt?: string }) =>
  run((me) => svc.createJob(me, { ...input, appliedAt: date(input.appliedAt) }));
export const updateJobApplication = async (id: string, input: Partial<svc.JobInput>) => run((me) => svc.updateJob(me, id, input));
export const deleteJobApplication = async (id: string) => run((me) => svc.deleteJob(me, id));
export const logJobTouch = async (id: string, ev: JobEvent, input: { text?: string; accountId?: string | null; at?: string; interviewAt?: string }) =>
  run((me) => svc.logJobEvent(me, id, ev, { text: input.text, accountId: input.accountId, at: date(input.at), interviewAt: date(input.interviewAt) }));
export const setJobApplicationStage = async (id: string, stage: JobStage, note?: string) => run((me) => svc.setJobStage(me, id, stage, { note }));
export const setJobApplicationFollowup = async (id: string, when: string | null) => run((me) => svc.setJobFollowup(me, id, when ? new Date(when) : null));

export const loadLogTimeline = async (kind: "contact" | "job", id: string) => run((me) => svc.timeline(me, kind, id));
export const reloadLog = async () => run((me) => svc.loadLog(me));

export const saveSignalConfig = async (input: { url: string; bearer?: string; enabled: boolean }) =>
  run(async (me) => {
    if (me.role !== "MANAGER" && me.role !== "SUPER_ADMIN") throw new svc.LogError("Only managers and admins can change the agent signal.");
    const url = input.url.trim();
    if (input.enabled && !/^https:\/\/[^\s]+$/.test(url)) throw new svc.LogError("The webhook must be an https:// URL.");
    await svc.writeSignalConfig({ url, enabled: input.enabled, ...(input.bearer !== undefined && input.bearer !== "••••" ? { bearer: input.bearer.trim() } : {}) });
    const c = await svc.readSignalConfig();
    return { ...c, bearer: c.bearer ? "••••" : "" };
  });
export const testSignal = async () =>
  run(async (me) => {
    if (me.role !== "MANAGER" && me.role !== "SUPER_ADMIN") throw new svc.LogError("Only managers and admins can do that.");
    return svc.signalDueFollowups();
  });
