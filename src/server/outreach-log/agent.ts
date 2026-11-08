// MCP tools for the Outreach & Jobs log (WhatsApp, email, social DMs, job applications).
// Wired into /api/mcp next to the cold-calling social tools; same bearer tokens.

import { z } from "zod";
import {
  CHANNEL_IDS,
  CONTACT_EVENTS,
  CONTACT_STAGES,
  JOB_EVENTS,
  JOB_SOURCE_IDS,
  JOB_STAGES,
  type ContactStage,
  type JobStage,
} from "@/lib/outreach-log/constants";
import {
  AGENT_BRIEF,
  LogError,
  createContact,
  createJob,
  dueFollowups,
  findContactByHandle,
  findJobByUrl,
  listAccounts,
  listCampaigns,
  logContactEvent,
  resolveCampaign,
  updateContact,
  logJobEvent,
  sendCounts,
  setContactStage,
  setJobStage,
} from "./service";
import type { User } from "@/lib/types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const when = z.string().datetime({ offset: true }).optional();
const toDate = (v?: string) => (v ? new Date(v) : undefined);

async function resolveAccount(me: User, account: string | undefined, channel?: string) {
  if (!account) return undefined;
  const all = await listAccounts(me);
  const a = account.trim().toLowerCase();
  const hit = all.find((x) => x.id === account) ?? all.find((x) => (!channel || x.channel === channel) && (x.label.toLowerCase() === a || x.handle.toLowerCase() === a));
  if (!hit) throw new LogError(`No sending account matches “${account}”. Call list_log_accounts to see the ids.`);
  return hit.id;
}

const contactOut = (c: { id: string; name: string; channel: string; stage: string; followupCount: number; nextFollowupAt: Date | null; accountId: string | null }) => ({
  id: c.id,
  name: c.name,
  channel: c.channel,
  stage: c.stage,
  followups_sent: c.followupCount,
  next_followup_at: iso(c.nextFollowupAt),
  account_id: c.accountId,
});
const jobOut = (j: { id: string; title: string; company: string; source: string; stage: string; followupCount: number; nextFollowupAt: Date | null; url: string }) => ({
  id: j.id,
  title: j.title,
  company: j.company,
  source: j.source,
  stage: j.stage,
  followups_sent: j.followupCount,
  next_followup_at: iso(j.nextFollowupAt),
  url: j.url,
});

export const LOG_TOOLS = [
  {
    name: "log_touch",
    description:
      "Outreach & Jobs log: record one outreach message on any channel (WhatsApp, email, LinkedIn, Facebook, Instagram, X, Threads, TikTok, Telegram, Upwork, phone). Identifies the person by channel + handle (phone number, email address, profile URL or @handle) and creates them if new. Stage and next follow-up date update automatically. Call after EVERY message you send and when a reply arrives.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", enum: CHANNEL_IDS },
        handle: { type: "string", description: "Phone (WhatsApp/phone), email address, profile URL or @handle." },
        action: { type: "string", enum: CONTACT_EVENTS, description: "sent = first message, followup = follow-up, reply = they replied, note = context only." },
        account: { type: "string", description: "Which of your sending accounts was used — its id or label (see list_log_accounts). Needed when you have several accounts on a channel." },
        message: { type: "string", description: "Exact text sent or received." },
        campaign: { type: "string", description: "Campaign / pool this outreach belongs to, by name or id, e.g. 'Free website offer'. Keeps different offers separate. A new name creates the campaign." },
        tags: { type: "string", description: "Comma-separated tags, e.g. 'shopify, us'." },
        name: { type: "string" },
        company: { type: "string" },
        title: { type: "string" },
        occurred_at: { type: "string", description: "ISO 8601; defaults to now." },
      },
      required: ["channel", "handle", "action"],
    },
  },
  {
    name: "log_job",
    description: "Outreach & Jobs log: record a remote job you applied to (or saved). Duplicate-safe by job URL. A follow-up is scheduled automatically 7 days after applying.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        company: { type: "string" },
        source: { type: "string", enum: JOB_SOURCE_IDS, description: "Where the job was found." },
        url: { type: "string", description: "Job post or proposal URL." },
        location: { type: "string" },
        salary: { type: "string" },
        account: { type: "string", description: "Account used to apply (id or label), e.g. your Upwork profile or a specific inbox." },
        contact_name: { type: "string" },
        contact_info: { type: "string", description: "Recruiter email / handle." },
        notes: { type: "string" },
        stage: { type: "string", enum: ["applied", "saved"], description: "Default applied." },
        applied_at: { type: "string" },
      },
      required: ["title", "source"],
    },
  },
  {
    name: "log_job_event",
    description: "Outreach & Jobs log: record something that happened on a job application — a follow-up you sent, a response, interview scheduled (pass interview_at), assessment, offer or rejection. Stage switches automatically.",
    inputSchema: {
      type: "object",
      properties: {
        job_id: { type: "string" },
        url: { type: "string", description: "Instead of job_id." },
        action: { type: "string", enum: JOB_EVENTS },
        message: { type: "string" },
        interview_at: { type: "string" },
        occurred_at: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "set_log_stage",
    description: "Outreach & Jobs log: set a stage by hand when an outcome isn't a message — e.g. contact interested / meeting / won / lost, job withdrawn / hired.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["contact", "job"] },
        id: { type: "string" },
        stage: { type: "string", description: `contact: ${CONTACT_STAGES.join(", ")}. job: ${JOB_STAGES.join(", ")}.` },
        note: { type: "string" },
        meeting_at: { type: "string", description: "For contact stage meeting." },
      },
      required: ["kind", "id", "stage"],
    },
  },
  {
    name: "get_log_due",
    description: "Outreach & Jobs log: follow-ups and replies due now (or within `days`), across all channels and job applications, plus today's send counts per account. Start every session with this.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Also include items due in the next N days (default 0 = due now/today)." },
        campaign: { type: "string", description: "Only this campaign (name or id). Excludes job applications." },
      },
    },
  },
  {
    name: "list_log_accounts",
    description: "Outreach & Jobs log: your sending accounts (several WhatsApp numbers, Facebook profiles, inboxes…) with ids, daily limits and today's sends, plus the outreach campaigns / pools.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

const S = {
  log_touch: z.object({
    channel: z.enum(CHANNEL_IDS as [string, ...string[]]),
    handle: z.string().min(1).max(500),
    action: z.enum(CONTACT_EVENTS),
    account: z.string().max(200).optional(),
    message: z.string().max(10000).optional(),
    campaign: z.string().max(120).optional(),
    tags: z.string().max(500).optional(),
    name: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    title: z.string().max(200).optional(),
    occurred_at: when,
  }),
  log_job: z.object({
    title: z.string().min(1).max(200),
    company: z.string().max(200).optional(),
    source: z.enum(JOB_SOURCE_IDS as [string, ...string[]]),
    url: z.string().max(1000).optional(),
    location: z.string().max(200).optional(),
    salary: z.string().max(120).optional(),
    account: z.string().max(200).optional(),
    contact_name: z.string().max(200).optional(),
    contact_info: z.string().max(255).optional(),
    notes: z.string().max(10000).optional(),
    stage: z.enum(["applied", "saved"]).optional(),
    applied_at: when,
  }),
  log_job_event: z.object({
    job_id: z.string().max(64).optional(),
    url: z.string().max(1000).optional(),
    action: z.enum(JOB_EVENTS),
    message: z.string().max(10000).optional(),
    interview_at: when,
    occurred_at: when,
  }),
  set_log_stage: z.object({ kind: z.enum(["contact", "job"]), id: z.string().max(64), stage: z.string().max(20), note: z.string().max(4000).optional(), meeting_at: when }),
  get_log_due: z.object({ days: z.number().int().min(0).max(60).optional(), campaign: z.string().max(120).optional() }),
  list_log_accounts: z.object({}).passthrough(),
};

export const isLogTool = (name: string) => LOG_TOOLS.some((t) => t.name === name);

export async function callLogTool(me: User, name: string, args: unknown) {
  const agent = { byAgent: true };
  switch (name) {
    case "log_touch": {
      const a = S.log_touch.parse(args ?? {});
      const accountId = await resolveAccount(me, a.account, a.channel);
      const campaignId = await resolveCampaign(me, a.campaign, true);
      const existing = await findContactByHandle(a.channel, a.handle);
      const c =
        existing ??
        (await createContact(me, { channel: a.channel, handle: a.handle, name: a.name ?? a.handle, company: a.company, title: a.title, accountId, campaignId, tags: a.tags }, { ...agent, reuse: true }));
      if (existing && ((campaignId && existing.campaignId !== campaignId) || a.tags))
        await updateContact(me, existing.id, { ...(campaignId && { campaignId }), ...(a.tags && { tags: [existing.tags, a.tags].filter(Boolean).join(", ") }) });
      const r = await logContactEvent(me, c.id, a.action, { text: a.message, accountId: accountId ?? undefined, at: toDate(a.occurred_at) }, agent);
      return { created: !existing, contact: contactOut(r.contact), warning: r.warning };
    }
    case "log_job": {
      const a = S.log_job.parse(args ?? {});
      const accountId = await resolveAccount(me, a.account);
      const existing = a.url ? await findJobByUrl(a.url) : null;
      const j =
        existing ??
        (await createJob(
          me,
          { title: a.title, company: a.company, source: a.source, url: a.url, location: a.location, salary: a.salary, accountId, contactName: a.contact_name, contactInfo: a.contact_info, notes: a.notes, stage: a.stage, appliedAt: toDate(a.applied_at) },
          { ...agent, reuse: true }
        ));
      return { created: !existing, job: jobOut(j), note: existing ? "Already logged — not duplicated. Use log_job_event for updates." : undefined };
    }
    case "log_job_event": {
      const a = S.log_job_event.parse(args ?? {});
      const id = a.job_id ?? (a.url ? (await findJobByUrl(a.url))?.id : undefined);
      if (!id) throw new LogError("Pass job_id or the job's url (see get_log_due or log_job).");
      const r = await logJobEvent(me, id, a.action, { text: a.message, at: toDate(a.occurred_at), interviewAt: toDate(a.interview_at) }, agent);
      return { job: jobOut(r.job), warning: r.warning };
    }
    case "set_log_stage": {
      const a = S.set_log_stage.parse(args ?? {});
      if (a.kind === "contact") {
        if (!CONTACT_STAGES.includes(a.stage as ContactStage)) throw new LogError(`Contact stages: ${CONTACT_STAGES.join(", ")}.`);
        return { contact: contactOut(await setContactStage(me, a.id, a.stage as ContactStage, { note: a.note, meetingAt: toDate(a.meeting_at) }, agent)) };
      }
      if (!JOB_STAGES.includes(a.stage as JobStage)) throw new LogError(`Job stages: ${JOB_STAGES.join(", ")}.`);
      return { job: jobOut(await setJobStage(me, a.id, a.stage as JobStage, { note: a.note }, agent)) };
    }
    case "get_log_due": {
      const a = S.get_log_due.parse(args ?? {});
      const until = a.days ? new Date(Date.now() + a.days * 864e5) : undefined;
      const campaignId = (await resolveCampaign(me, a.campaign)) ?? undefined;
      const [items, accounts, counts, campaigns] = await Promise.all([dueFollowups(me, until, campaignId), listAccounts(me), sendCounts(me), listCampaigns()]);
      const cname = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? null;
      return {
        brief: AGENT_BRIEF,
        due: items.slice(0, 200).map((i) => ({ ...i, campaign: cname(i.campaignId) })),
        accounts: accounts.map((x) => ({ id: x.id, channel: x.channel, label: x.label, daily_limit: x.dailyLimit || null, sent_today: counts.find((c) => c.accountId === x.id)?.sent ?? 0 })),
      };
    }
    case "list_log_accounts": {
      const [accounts, counts, campaigns] = await Promise.all([listAccounts(me), sendCounts(me), listCampaigns()]);
      return {
        campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, description: c.description, active: c.active })),
        accounts: accounts.map((x) => ({ id: x.id, channel: x.channel, label: x.label, handle: x.handle, active: x.active, daily_limit: x.dailyLimit || null, sent_today: counts.find((c) => c.accountId === x.id)?.sent ?? 0 })),
      };
    }
    default:
      throw new LogError(`Unknown tool: ${name}`);
  }
}
export { LogError };
