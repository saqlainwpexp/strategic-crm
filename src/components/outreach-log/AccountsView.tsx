"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { LogAccount } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Overlay";
import { Field, Input, Select } from "@/components/ui/Form";
import { AgentAccess } from "@/components/outreach/AgentAccess";
import { CHANNELS, channelLabel } from "@/lib/outreach-log/constants";
import type { SignalConfig } from "@/server/outreach-log/service";
import { deleteLogAccount, saveLogAccount, saveSignalConfig, testSignal } from "@/server/outreach-log/actions";
import { formatDateTime } from "@/lib/date";
import { ChannelTag, useLogAction } from "./shared";

export function AccountsView({
  accounts,
  counts,
  signal,
  canManage,
}: {
  accounts: LogAccount[];
  counts: { accountId: string; sent: number }[];
  signal: SignalConfig | null;
  canManage: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const { run, pending } = useLogAction();
  const [editing, setEditing] = useState<LogAccount | "new" | null>(null);
  useEffect(() => {
    if (params.get("new")) setEditing("new");
  }, [params]);

  const byChannel = CHANNELS.map((c) => ({ ...c, list: accounts.filter((a) => a.channel === c.id) })).filter((g) => g.list.length);

  return (
    <div>
      <PageHeader
        title="Accounts & agent"
        subtitle="The WhatsApp numbers, inboxes and social profiles you send from — as many per channel as you use."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" strokeWidth={2} /> Add account
          </Button>
        }
      />

      <Card className="p-0">
        {byChannel.length === 0 ? (
          <EmptyState icon={Users} title="No sending accounts yet" body="Add each identity you outreach from, e.g. “WhatsApp — Business 1”, “WhatsApp — Business 2”, “Facebook — Saqlain”." action={<Button onClick={() => setEditing("new")}>Add account</Button>} />
        ) : (
          byChannel.map((g) => (
            <div key={g.id} className="border-t border-black/[0.05] px-6 py-5 first:border-t-0">
              <p className="mb-3 text-[12.5px] uppercase tracking-[0.05em] text-neutral-400">
                {g.label} · {g.list.length} account{g.list.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {g.list.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-4 rounded-2xl px-2 py-2.5 hover:bg-page/60">
                    <div className="min-w-0 flex-1">
                      <ChannelTag channel={a.channel} account={a.label} />
                      {a.handle && <p className="ml-[18px] mt-0.5 text-[12.5px] text-neutral-500">{a.handle}</p>}
                    </div>
                    {!a.active && <span className="rounded-full bg-neutral-100 px-3 py-1 text-[12px] text-neutral-500">Paused</span>}
                    <span className="w-[120px] text-right text-[13px] tabular-nums text-neutral-600">
                      {counts.find((c) => c.accountId === a.id)?.sent ?? 0}
                      {a.dailyLimit ? ` / ${a.dailyLimit}` : ""} today
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Delete"
                      onClick={async () => confirm(`Delete “${a.label}”? Logged messages stay, just without the account.`) && run(() => deleteLogAccount(a.id), "Account deleted")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>

      {canManage && signal && (
        <div className="mt-12 space-y-8">
          <SignalCard signal={signal} />
          <AgentAccess />
        </div>
      )}

      {editing && (
        <AccountModal
          account={editing === "new" ? null : editing}
          pending={pending}
          onClose={() => {
            setEditing(null);
            if (params.get("new")) router.replace("/log/accounts");
          }}
          onSave={async (f) => (await run(() => saveLogAccount(f), "Account saved")) && setEditing(null)}
        />
      )}
    </div>
  );
}

function AccountModal({
  account,
  pending,
  onClose,
  onSave,
}: {
  account: LogAccount | null;
  pending: boolean;
  onClose: () => void;
  onSave: (f: { id?: string; channel: string; label: string; handle: string; dailyLimit: number; active: boolean }) => void;
}) {
  const [f, setF] = useState({ channel: account?.channel ?? "whatsapp", label: account?.label ?? "", handle: account?.handle ?? "", dailyLimit: account?.dailyLimit ?? 0, active: account?.active ?? true });
  return (
    <Modal
      open
      onClose={onClose}
      title={account ? "Edit account" : "Add sending account"}
      subtitle="Every message you log can say which account sent it, so sends and limits are tracked per account."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={pending || !f.label.trim()} onClick={() => onSave({ ...f, id: account?.id })}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Channel">
          <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Name" required>
          <Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder={`${channelLabel(f.channel)} — Business 1`} />
        </Field>
        <Field label="Number / address / profile" hint={CHANNELS.find((c) => c.id === f.channel)?.handleHint}>
          <Input value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} />
        </Field>
        <Field label="Daily send limit" hint="0 = no limit. You get a warning at 80% and when it's reached.">
          <Input type="number" min={0} value={f.dailyLimit} onChange={(e) => setF({ ...f, dailyLimit: Number(e.target.value) || 0 })} />
        </Field>
        <label className="flex items-center gap-3 text-[14px] sm:col-span-2">
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4" />
          Active (shown when logging messages)
        </label>
      </div>
    </Modal>
  );
}

function SignalCard({ signal }: { signal: SignalConfig }) {
  const { run, pending } = useLogAction();
  const [url, setUrl] = useState(signal.url);
  const [bearer, setBearer] = useState(signal.bearer);
  const [enabled, setEnabled] = useState(signal.enabled);
  return (
    <Card>
      <CardHeader title="Follow-up signal to your Claude agent" subtitle="When a follow-up or reply becomes due, the CRM POSTs it to this webhook — once per due date. Checked every 5 minutes." />
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_280px]">
        <Field label="Webhook URL (https)" hint="A Claude Code routine / remote trigger URL, a Zapier/Make hook, or your own agent endpoint. The JSON body has `text` (a ready-to-run brief) and `items`.">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Bearer token (optional)" hint="Sent as Authorization: Bearer …">
          <Input value={bearer} onChange={(e) => setBearer(e.target.value)} type="password" />
        </Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-3 text-[14px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4" />
          Send signals
        </label>
        <div className="ml-auto flex gap-3">
          <Button variant="secondary" disabled={pending || !signal.enabled} onClick={() => run(() => testSignal(), "Checked — see status below")}>
            <BellRing className="h-4 w-4" /> Send due now
          </Button>
          <Button disabled={pending} onClick={() => run(() => saveSignalConfig({ url, bearer, enabled }), "Signal settings saved")}>Save</Button>
        </div>
      </div>
      <p className="mt-5 text-[12.5px] leading-relaxed text-neutral-500">
        {signal.lastRunAt ? `Last signal ${formatDateTime(signal.lastRunAt)} — ${signal.lastStatus}.` : "No signal sent yet."} Agents can also pull the list any time with the MCP tool
        <code className="mx-1 rounded bg-page px-1.5 py-0.5">get_log_due</code>and log with
        <code className="mx-1 rounded bg-page px-1.5 py-0.5">log_touch</code>/<code className="mx-1 rounded bg-page px-1.5 py-0.5">log_job</code>.
      </p>
    </Card>
  );
}
