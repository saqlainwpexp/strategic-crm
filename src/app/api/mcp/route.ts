// MCP server for outreach agents (Streamable HTTP, stateless JSON responses).
// Auth: "Authorization: Bearer scrm_…" — a token from Admin → Social → Agent access.
// The agent acts as the token's CRM user: same duplicate check, limits and permissions.

import { NextResponse } from "next/server";
import { z } from "zod";
import { withAgentToken } from "@/server/outreach/agent-tokens";
import { AGENT_ACTIONS, agentDue, agentLog, agentLookup, agentSetStage } from "@/server/outreach/agent";
import { OutreachError } from "@/server/outreach/service";
import { OUTREACH_STAGES, PLATFORM_IDS, SENTIMENTS } from "@/lib/outreach/platforms";
import type { User } from "@/lib/types";
import { LOG_TOOLS, LogError, callLogTool, isLogTool } from "@/server/outreach-log/agent";

export const dynamic = "force-dynamic";

const PROTOCOL = "2025-06-18";
const INSTRUCTIONS = `Strategic CRM — social outreach log.
Rules for outreach agents:
1. BEFORE messaging anyone, call lookup_lead with their profile URL. If advice says do not message, skip them.
2. AFTER every send (connection request, DM, follow-up, comment, voice note, story reply), call log_outreach once.
3. When you see a reply, call log_outreach with action "reply_received" and the reply text. When a connection is accepted, action "connection_accepted".
4. When someone is interested, books a call, says no, or becomes a client, call update_stage.
5. If log_outreach returns an error about the daily limit, STOP sending on that platform for today.
6. Start a session with get_followups_due to see replies waiting and follow-ups due.

Outreach & Jobs log (separate from the cold-calling CRM — WhatsApp, email, social DMs and remote job applications, across several sending accounts per channel):
7. Start with get_log_due. For each item, send the follow-up / answer the reply, then log it.
8. After EVERY WhatsApp/email/DM you send, call log_touch with the channel, the person's handle and the account you used. When they reply, log_touch with action "reply".
9. When you apply to a job, call log_job. Later responses, interviews, offers or rejections go to log_job_event. Stages and follow-up dates update automatically.
10. If log_touch warns an account hit its daily limit, switch to another account on that channel or stop.`;

const platform = z.enum(PLATFORM_IDS as [string, ...string[]]).optional();
const when = z.string().datetime({ offset: true }).optional();

const TOOLS = [
  {
    name: "log_outreach",
    description:
      "Log one outreach event for a person, identified by their profile URL (or @handle + platform). Creates the lead if new (duplicate-safe). Call this after EVERY message or connection request you send, and when you receive a reply. Returns the thread's stage, next follow-up date and any daily-limit warning.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", description: "Profile URL, e.g. https://www.linkedin.com/in/jane-doe, or an @handle together with `platform`." },
        platform: { type: "string", enum: PLATFORM_IDS, description: "Only needed when `profile` is a bare handle." },
        action: {
          type: "string",
          enum: AGENT_ACTIONS,
          description: "What happened. Outbound: connection_request, dm (first message or follow-up), comment, like, story_reply, voice_note. Inbound: reply_received. Status: connection_accepted.",
        },
        message: { type: "string", description: "The exact text you sent, or the reply you received." },
        name: { type: "string", description: "Person's full name (used when creating a new lead)." },
        company: { type: "string" },
        title: { type: "string", description: "Job title." },
        thread_url: { type: "string", description: "Link to the DM conversation, if known." },
        occurred_at: { type: "string", description: "ISO 8601 time it happened. Defaults to now." },
      },
      required: ["profile", "action"],
    },
  },
  {
    name: "update_stage",
    description:
      "Change the outreach stage for a person after a meaningful outcome. interested / call_booked / won also update the CRM pipeline; call_booked creates a calendar meeting (pass meeting_at).",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string" },
        platform: { type: "string", enum: PLATFORM_IDS },
        stage: { type: "string", enum: OUTREACH_STAGES },
        note: { type: "string", description: "Short reason / context for the rep." },
        meeting_at: { type: "string", description: "ISO 8601 time of the booked call (stage call_booked)." },
        sentiment: { type: "string", enum: SENTIMENTS, description: "How their reply felt." },
      },
      required: ["profile", "stage"],
    },
  },
  {
    name: "lookup_lead",
    description: "Check whether a person is already in the CRM and what has happened so far. Call BEFORE messaging someone to avoid double-contacting or contacting another rep's lead.",
    inputSchema: {
      type: "object",
      properties: { profile: { type: "string" }, platform: { type: "string", enum: PLATFORM_IDS } },
      required: ["profile"],
    },
  },
  {
    name: "get_followups_due",
    description: "List replies waiting on us and follow-ups due by end of today for the user this agent logs as, plus today's send counts against daily limits.",
    inputSchema: {
      type: "object",
      properties: { platform: { type: "string", enum: PLATFORM_IDS }, limit: { type: "number", description: "Max rows per list (default 50)." } },
    },
  },
] as const;

const ALL_TOOLS = [...TOOLS, ...LOG_TOOLS];

const schemas = {
  log_outreach: z.object({
    profile: z.string().min(1).max(1000),
    platform,
    action: z.enum(AGENT_ACTIONS),
    message: z.string().max(10000).optional(),
    name: z.string().max(200).optional(),
    company: z.string().max(200).optional(),
    title: z.string().max(190).optional(),
    thread_url: z.string().max(500).optional(),
    occurred_at: when,
  }),
  update_stage: z.object({
    profile: z.string().min(1).max(1000),
    platform,
    stage: z.enum(OUTREACH_STAGES),
    note: z.string().max(4000).optional(),
    meeting_at: when,
    sentiment: z.enum(SENTIMENTS).optional(),
  }),
  lookup_lead: z.object({ profile: z.string().min(1).max(1000), platform }),
  get_followups_due: z.object({ platform, limit: z.number().int().min(1).max(200).optional() }),
};

async function callTool(me: User, name: string, args: unknown) {
  if (isLogTool(name)) return callLogTool(me, name, args);
  switch (name) {
    case "log_outreach": {
      const a = schemas.log_outreach.parse(args ?? {});
      return agentLog(me, {
        profile: a.profile,
        platform: a.platform,
        action: a.action,
        message: a.message,
        name: a.name,
        company: a.company,
        title: a.title,
        threadUrl: a.thread_url,
        occurredAt: a.occurred_at ? new Date(a.occurred_at) : undefined,
      });
    }
    case "update_stage": {
      const a = schemas.update_stage.parse(args ?? {});
      return agentSetStage(me, { ...a, meetingAt: a.meeting_at ? new Date(a.meeting_at) : undefined });
    }
    case "lookup_lead":
      return agentLookup(me, schemas.lookup_lead.parse(args ?? {}));
    case "get_followups_due":
      return agentDue(me, schemas.get_followups_due.parse(args ?? {}));
    default:
      throw new OutreachError(`Unknown tool: ${name}`);
  }
}

type RpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

async function handle(msg: RpcRequest, me: User, tokenName: string) {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id ?? null, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } });

  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: typeof msg.params?.protocolVersion === "string" ? msg.params.protocolVersion : PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "strategic-crm-outreach", title: "Strategic CRM — Social outreach", version: "1.0.0" },
        instructions: `${INSTRUCTIONS}\nYou are logging as: ${me.name} (token "${tokenName}").`,
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({ tools: ALL_TOOLS });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      try {
        const result = await callTool(me, name, msg.params?.arguments);
        return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
      } catch (e) {
        const text =
          e instanceof OutreachError || e instanceof LogError
            ? e.message
            : e instanceof z.ZodError
              ? `Invalid arguments: ${e.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`
              : "The CRM couldn't save that. Try again shortly.";
        if (!(e instanceof OutreachError) && !(e instanceof LogError) && !(e instanceof z.ZodError)) console.error("[mcp]", name, e);
        return reply({ content: [{ type: "text", text }], isError: true });
      }
    }
    default:
      if (msg.method?.startsWith("notifications/")) return null;
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }
  const auth = await withAgentToken(req.headers.get("authorization"), async (me, tokenName) => {
    const batch = Array.isArray(body) ? (body as RpcRequest[]) : [body as RpcRequest];
    const out = [];
    for (const m of batch.slice(0, 50)) {
      const r = await handle(m, me, tokenName);
      if (r && m.id !== undefined) out.push(r);
    }
    return Array.isArray(body) ? out : out[0] ?? null;
  });
  if (!auth.ok)
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: send 'Authorization: Bearer <token>' from Admin → Social → Agent access." } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="strategic-crm"' } }
    );
  if (auth.value === null || (Array.isArray(auth.value) && auth.value.length === 0)) return new NextResponse(null, { status: 202 });
  return NextResponse.json(auth.value);
}

export async function GET() {
  // No server-initiated stream; clients fall back to plain POST request/response.
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
