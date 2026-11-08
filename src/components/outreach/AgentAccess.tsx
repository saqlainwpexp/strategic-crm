"use client";

// Admin → Social → Agent access: tokens that let an outreach agent (Claude, etc.) log into
// the CRM through MCP. Each token logs as one rep.

import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Trash2 } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { createAgentTokenAction, listAgentTokensAction, revokeAgentTokenAction } from "@/server/outreach/actions";
import type { AgentTokenInfo } from "@/server/outreach/agent-tokens";
import { formatDateTime } from "@/lib/date";

export function AgentAccess() {
  const { data: crm, viewer, notify } = useCrm();
  const { act } = useOutreach();
  const [tokens, setTokens] = useState<AgentTokenInfo[] | null>(null);
  const [name, setName] = useState("Outreach agent");
  const [userId, setUserId] = useState(viewer.id);
  const [fresh, setFresh] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    const r = await listAgentTokensAction();
    if (r.ok) setTokens(r.data);
  }, []);
  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, [load]);

  const create = async () => {
    const r = await act(createAgentTokenAction({ name, userId }), "Token created — copy it now");
    if (r.ok) {
      setFresh(r.data);
      load();
    }
  };
  const revoke = async (t: AgentTokenInfo) => {
    if (!window.confirm(`Revoke "${t.name}"? Any agent using it stops logging immediately.`)) return;
    const r = await act(revokeAgentTokenAction(t.id), "Token revoked");
    if (r.ok) load();
  };
  const copy = (text: string, what: string) =>
    navigator.clipboard.writeText(text).then(
      () => notify(`${what} copied`),
      () => notify("Your browser blocked the clipboard.", "error")
    );

  const url = `${origin}/api/mcp`;
  const tok = fresh ?? "<YOUR_TOKEN>";
  const cliCmd = `claude mcp add --transport http strategic-crm ${url} --header "Authorization: Bearer ${tok}"`;
  const jsonCfg = JSON.stringify({ mcpServers: { "strategic-crm": { type: "http", url, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2);
  const prompt = `You have the "strategic-crm" MCP tools. Before messaging anyone, call lookup_lead with their profile URL and skip them if it says not to message. After every connection request, DM, follow-up, comment or voice note you send, call log_outreach with the profile URL, the action and the exact message text. When someone replies, log action "reply_received" with their reply. Use update_stage for interested / call_booked / not_interested. If you hit a daily-limit error, stop sending on that platform today.`;

  return (
    <Card>
      <CardHeader
        title="Agent access (MCP)"
        subtitle="Let an AI outreach agent log every connection request, DM and reply into the CRM automatically. Each token logs as one rep, so it counts against that rep's daily limits."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field label="Token name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="LinkedIn agent — Ali" />
        </Field>
        <Field label="Logs as">
          <Select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {crm.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        <Button variant="brand" onClick={create}>
          <Bot className="h-4 w-4" /> Create token
        </Button>
      </div>

      {fresh && (
        <div className="mt-6 rounded-2xl bg-emerald-50 p-5">
          <p className="text-[13.5px] font-medium text-emerald-900">Copy this token now — it won't be shown again.</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-white px-4 py-2.5 text-[12.5px]">{fresh}</code>
            <Button size="sm" onClick={() => copy(fresh, "Token")}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-[15px] font-medium">Connect your agent</h3>
        <div className="mt-4 flex flex-col gap-5">
          <Snippet label="Claude Code (run once in a terminal)" text={cliCmd} onCopy={copy} />
          <Snippet label="Claude Desktop / Cursor / any MCP client (JSON config)" text={jsonCfg} onCopy={copy} />
          <Snippet label="Add to your agent's instructions" text={prompt} onCopy={copy} />
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-neutral-500">
          Tools: <code>log_outreach</code>, <code>update_stage</code>, <code>lookup_lead</code>, <code>get_followups_due</code>. Use your live CRM address (https://crm.strategiccoresolutions.com/api/mcp) for agents running anywhere other than this computer.
        </p>
      </div>

      <div className="mt-8">
        <h3 className="mb-3 text-[15px] font-medium">Active tokens</h3>
        {!tokens ? (
          <p className="text-[13px] text-neutral-400">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="rounded-2xl bg-soft px-5 py-8 text-center text-[13.5px] text-neutral-500">No agent tokens yet.</p>
        ) : (
          <table className="w-full text-[13.5px]">
            <thead className="text-left text-[12px] text-neutral-400">
              <tr>
                <th className="pb-3 font-normal">Name</th>
                <th className="pb-3 font-normal">Logs as</th>
                <th className="pb-3 font-normal">Token</th>
                <th className="pb-3 font-normal">Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="py-3">{t.name}</td>
                  <td className="py-3">{crm.users.find((u) => u.id === t.userId)?.name ?? "—"}</td>
                  <td className="py-3 font-mono text-[12px] text-neutral-500">scrm_{t.hint}</td>
                  <td className="py-3 text-neutral-500">{t.lastUsedAt ? formatDateTime(t.lastUsedAt) : "Never"}</td>
                  <td className="py-3 text-right">
                    <IconButton label="Revoke" size="sm" onClick={() => revoke(t)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function Snippet({ label, text, onCopy }: { label: string; text: string; onCopy: (t: string, what: string) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[13px] text-neutral-600">{label}</span>
        <button onClick={() => onCopy(text, label.split(" (")[0])} className="inline-flex items-center gap-1.5 text-[12.5px] text-neutral-500 hover:text-ink">
          <Copy className="h-3.5 w-3.5" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-2xl bg-ink px-4 py-3.5 text-[12px] leading-relaxed text-white/90">{text}</pre>
    </div>
  );
}
