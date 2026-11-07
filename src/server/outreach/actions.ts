"use server";

// Server actions for social outreach. Validation here; rules and scoping in ./service.ts.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError, requireActionUser } from "../session";
import * as svc from "./service";
import { ACTIVITY_TYPES, OUTREACH_STAGES, PLATFORM_IDS, SENTIMENTS } from "@/lib/outreach/platforms";
import type { User } from "@/lib/types";

export type OutreachResult<T = undefined> = { ok: true; data: T; warning?: string | null } | { ok: false; error: string; code?: string };

async function run<T>(name: string, fn: (me: User) => Promise<T>, warning?: (d: T) => string | null | undefined): Promise<OutreachResult<T>> {
  try {
    const me = await requireActionUser();
    const data = await fn(me);
    revalidatePath("/", "layout");
    return { ok: true, data, warning: warning?.(data) ?? null };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof svc.OutreachError) return { ok: false, error: e.message, code: e.code };
    if (e instanceof z.ZodError) return { ok: false, error: "Some of the details aren't valid. Please check and try again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "That already exists." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return { ok: false, error: "That record no longer exists." };
    console.error(`[outreach:${name}]`, e);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
}

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const platform = z.enum(PLATFORM_IDS as [string, ...string[]]);
const note = z.string().max(10000).optional();
const date = z.string().datetime({ offset: true }).nullable().optional();
const toDate = (s: string | null | undefined) => (s ? new Date(s) : undefined);

export async function quickLogAction(input: {
  threadId: string;
  kind: string;
  note?: string;
  meetingAt?: string | null;
  override?: boolean;
  sentiment?: string | null;
}) {
  return run(
    "quickLog",
    async (me) => {
      const p = z
        .object({
          threadId: id,
          kind: z.enum(["sent_connection", "accepted", "sent_dm", "replied", "interested", "booked", "not_interested", "won"]),
          note,
          meetingAt: date,
          override: z.boolean().optional(),
          sentiment: z.enum(SENTIMENTS).nullable().optional(),
        })
        .parse(input);
      return svc.quickLog(me, { ...p, meetingAt: toDate(p.meetingAt) });
    },
    (r) => r?.warning
  );
}

export async function logActivityAction(input: {
  threadId: string;
  direction: string;
  type: string;
  messageText?: string;
  occurredAt?: string | null;
  override?: boolean;
}) {
  return run(
    "logActivity",
    async (me) => {
      const p = z
        .object({ threadId: id, direction: z.enum(["outbound", "inbound"]), type: z.enum(ACTIVITY_TYPES), messageText: note, occurredAt: date, override: z.boolean().optional() })
        .parse(input);
      return svc.logActivity(me, { ...p, occurredAt: toDate(p.occurredAt) });
    },
    (r) => r.warning
  );
}

export async function setStageAction(input: { threadId: string; stage: string; note?: string; meetingAt?: string | null }) {
  return run("setStage", async (me) => {
    const p = z.object({ threadId: id, stage: z.enum(OUTREACH_STAGES), note, meetingAt: date }).parse(input);
    await svc.setStage(me, { ...p, meetingAt: toDate(p.meetingAt) ?? null });
  });
}

export async function setSentimentAction(threadId: string, sentiment: string | null) {
  return run("setSentiment", async (me) => svc.setSentiment(me, id.parse(threadId), z.enum(SENTIMENTS).nullable().parse(sentiment)));
}

export async function openThreadAction(leadId: string, platformId: string) {
  return run("openThread", async (me) => (await svc.openThread(me, id.parse(leadId), platform.parse(platformId))).id);
}

export async function updateThreadAction(
  threadId: string,
  patch: { threadUrl?: string; campaignId?: string | null; templateId?: string | null; notes?: string; ownerId?: string | null }
) {
  return run("updateThread", async (me) => {
    const p = z
      .object({
        threadUrl: z.string().max(500).optional(),
        campaignId: id.nullable().optional(),
        templateId: id.nullable().optional(),
        notes: z.string().max(20000).optional(),
        ownerId: id.nullable().optional(),
      })
      .parse(patch);
    if (p.threadUrl && !/^https?:\/\//i.test(p.threadUrl)) throw new svc.OutreachError("The thread link must start with https://");
    await svc.updateThread(me, id.parse(threadId), p);
  });
}

export async function saveLeadSocialAction(
  leadId: string,
  input: {
    profiles?: { platform: string; value: string }[];
    jobTitle?: string;
    industry?: string;
    location?: string;
    connectionDegree?: string;
    followerCount?: number | null;
    primaryChannel?: string;
  }
) {
  return run("saveLeadSocial", async (me) => {
    const p = z
      .object({
        profiles: z.array(z.object({ platform, value: z.string().max(500) })).max(20).optional(),
        jobTitle: z.string().max(190).optional(),
        industry: z.string().max(190).optional(),
        location: z.string().max(190).optional(),
        connectionDegree: z.string().max(8).optional(),
        followerCount: z.number().int().min(0).max(1e10).nullable().optional(),
        primaryChannel: z.string().max(20).optional(),
      })
      .parse(input);
    await svc.saveLeadSocial(me, id.parse(leadId), p);
  });
}

/** Add a lead from a profile URL (the "Add social lead" button). */
export async function quickAddAction(input: { url: string; name?: string; title?: string; company?: string }) {
  return run("quickAdd", async (me) => {
    const p = z.object({ url: z.string().min(1).max(1000), name: z.string().max(200).optional(), title: z.string().max(190).optional(), company: z.string().max(200).optional() }).parse(input);
    return svc.quickAdd(me, p, "Manual");
  });
}

const importRow = z.object({
  profile: z.string().max(1000),
  platform: z.string().max(20).optional(),
  name: z.string().max(200).optional(),
  title: z.string().max(190).optional(),
  company: z.string().max(200).optional(),
  location: z.string().max(190).optional(),
  industry: z.string().max(190).optional(),
  email: z.string().max(254).optional(),
  phone: z.string().max(40).optional(),
  website: z.string().max(300).optional(),
  connectionDegree: z.string().max(20).optional(),
  followerCount: z.number().int().min(0).nullable().optional(),
  source: z.string().max(120).optional(),
});

export async function importSocialAction(
  rows: z.infer<typeof importRow>[],
  opts: { platform?: string; campaignId?: string | null; source?: string; tags?: string[] }
) {
  return run("importSocial", async (me) => {
    const r = z.array(importRow).max(5000).parse(rows);
    const o = z
      .object({ platform: z.string().max(20).optional(), campaignId: id.nullable().optional(), source: z.string().max(120).optional(), tags: z.array(z.string().max(60)).max(20).optional() })
      .parse(opts);
    return svc.importSocial(me, r, o);
  });
}

// ─── Admin ───────────────────────────────────────────────────

export async function saveOutreachTemplateAction(t: { id?: string; name: string; platform: string; body: string; active: boolean }) {
  return run("saveTemplate", async (me) => {
    const p = z.object({ id: id.optional(), name: z.string().max(190), platform: z.string().max(20), body: z.string().max(8000), active: z.boolean() }).parse(t);
    return (await svc.saveTemplate(me, p)).id;
  });
}

export async function deleteOutreachTemplateAction(templateId: string) {
  return run("deleteTemplate", async (me) => svc.deleteTemplate(me, id.parse(templateId)));
}

export async function saveOutreachCampaignAction(c: {
  id?: string;
  name: string;
  platform: string;
  audience: string;
  templateId: string | null;
  startDate: string | null;
  dailyLimit: number | null;
  goal: string;
  status: string;
}) {
  return run("saveCampaign", async (me) => {
    const p = z
      .object({
        id: id.optional(),
        name: z.string().max(190),
        platform: z.string().max(20),
        audience: z.string().max(4000),
        templateId: id.nullable(),
        startDate: z.string().max(40).nullable(),
        dailyLimit: z.number().int().min(0).max(100000).nullable(),
        goal: z.string().max(4000),
        status: z.string().max(20),
      })
      .parse(c);
    return (await svc.saveCampaign(me, p)).id;
  });
}

export async function deleteOutreachCampaignAction(campaignId: string) {
  return run("deleteCampaign", async (me) => svc.deleteCampaign(me, id.parse(campaignId)));
}

export async function saveSocialAccountAction(a: { id?: string; userId: string; platform: string; handle: string; dailyConnectionLimit: number; dailyDmLimit: number }) {
  return run("saveSocialAccount", async (me) => {
    const p = z
      .object({ id: id.optional(), userId: id, platform, handle: z.string().max(190), dailyConnectionLimit: z.number().int().min(0).max(10000), dailyDmLimit: z.number().int().min(0).max(10000) })
      .parse(a);
    return (await svc.saveSocialAccount(me, p)).id;
  });
}

export async function deleteSocialAccountAction(accountId: string) {
  return run("deleteSocialAccount", async (me) => svc.deleteSocialAccount(me, id.parse(accountId)));
}

export async function saveLeadSourcesAction(sources: string[]) {
  return run("saveLeadSources", async (me) => svc.saveLeadSources(me, z.array(z.string().max(120)).max(100).parse(sources)));
}
