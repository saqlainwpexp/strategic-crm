"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquarePlus, MessagesSquare, Plus, Reply, Send, StickyNote, Trash2 } from "lucide-react";
import type { LogAccount, LogContact } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea, SearchInput } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils";
import { CHANNELS, CONTACT_STAGES, CONTACT_STAGE_LABEL, channelLabel, type ContactEvent, type ContactStage } from "@/lib/outreach-log/constants";
import {
  createLogContact,
  deleteLogContact,
  logContactTouch,
  setLogContactFollowup,
  setLogContactStage,
  updateLogContact,
} from "@/server/outreach-log/actions";
import { AccountSelect, ChannelTag, DueText, StagePill, Timeline, toLocalInput, useLogAction } from "./shared";

type Filter = "all" | "due" | "active" | "closed";

export function ContactsView({ contacts, accounts }: { contacts: LogContact[]; accounts: LogAccount[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [channel, setChannel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (params.get("new")) setAdding(true);
    const id = params.get("contact");
    if (id) setOpenId(id);
  }, [params]);

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.label ?? null;
  const endOfDay = new Date().setHours(23, 59, 59, 999);
  const isDue = (c: LogContact) => !!c.nextFollowupAt && new Date(c.nextFollowupAt).getTime() <= endOfDay;
  const closed = (c: LogContact) => ["won", "lost", "no_response"].includes(c.stage);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return contacts
      .filter((c) => (filter === "due" ? isDue(c) : filter === "active" ? !closed(c) : filter === "closed" ? closed(c) : true))
      .filter((c) => !channel || c.channel === channel)
      .filter((c) => !accountId || c.accountId === accountId)
      .filter((c) => !stage || c.stage === stage)
      .filter((c) => !term || [c.name, c.company, c.handle, c.title].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => (a.nextFollowupAt ? new Date(a.nextFollowupAt).getTime() : Infinity) - (b.nextFollowupAt ? new Date(b.nextFollowupAt).getTime() : Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, q, filter, channel, accountId, stage]);

  const open = contacts.find((c) => c.id === openId) ?? null;
  const close = () => {
    setOpenId(null);
    if (params.get("contact")) router.replace("/log/outreach");
  };

  return (
    <div>
      <PageHeader
        title="Outreach"
        subtitle="Every WhatsApp, email and DM you send — stages and follow-ups move on their own."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Log outreach
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: contacts.length },
            { value: "due", label: "Due", count: contacts.filter(isDue).length },
            { value: "active", label: "Active", count: contacts.filter((c) => !closed(c)).length },
            { value: "closed", label: "Closed" },
          ]}
        />
        <select value={channel} onChange={(e) => { setChannel(e.target.value); setAccountId(""); }} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
          <option value="">All accounts</option>
          {accounts.filter((a) => !channel || a.channel === channel).map((a) => (
            <option key={a.id} value={a.id}>{channelLabel(a.channel)} · {a.label}</option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
          <option value="">All stages</option>
          {CONTACT_STAGES.map((s) => (
            <option key={s} value={s}>{CONTACT_STAGE_LABEL[s]}</option>
          ))}
        </select>
        <div className="ml-auto w-full sm:w-[280px]">
          <SearchInput value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="Search name, company, handle…" />
        </div>
      </div>

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={contacts.length ? "Nothing matches these filters" : "No outreach logged yet"}
            body={contacts.length ? undefined : "Log a WhatsApp, email or DM and the follow-ups will be scheduled for you."}
            action={!contacts.length && <Button onClick={() => setAdding(true)}>Log outreach</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="text-[12.5px] uppercase tracking-[0.04em] text-neutral-400">
                  <th className="px-6 py-4 font-normal">Contact</th>
                  <th className="px-4 py-4 font-normal">Channel · account</th>
                  <th className="px-4 py-4 font-normal">Stage</th>
                  <th className="px-4 py-4 font-normal">Follow-ups</th>
                  <th className="px-6 py-4 font-normal">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer border-t border-black/[0.05] transition-colors hover:bg-page/60">
                    <td className="px-6 py-4">
                      <p className="text-[14.5px] font-medium">{c.name}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-neutral-500">{[c.title, c.company].filter(Boolean).join(" · ") || c.handle}</p>
                    </td>
                    <td className="px-4 py-4"><ChannelTag channel={c.channel} account={accountName(c.accountId)} /></td>
                    <td className="px-4 py-4"><StagePill kind="contact" stage={c.stage} /></td>
                    <td className="px-4 py-4 text-[13.5px] tabular-nums text-neutral-600">{c.followupCount}</td>
                    <td className="px-6 py-4"><DueText at={c.nextFollowupAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-[12.5px] text-neutral-400">
        Automatic follow-ups: 2 days after the first message, then 3, 5 and 7 days. No reply after the third follow-up → “No response”.
      </p>

      <AddContactModal open={adding} onClose={() => { setAdding(false); if (params.get("new")) router.replace("/log/outreach"); }} accounts={accounts} />
      {open && <ContactDrawer contact={open} accounts={accounts} onClose={close} />}
    </div>
  );
}

function AddContactModal({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: LogAccount[] }) {
  const { run, pending } = useLogAction();
  const blank = { name: "", channel: "whatsapp", handle: "", company: "", title: "", accountId: "", source: "", firstMessage: "", logSent: true, notes: "" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((p) => ({ ...p, [k]: v }));
  const hint = CHANNELS.find((c) => c.id === f.channel)?.handleHint ?? "";

  const save = async () => {
    const r = await run(() => createLogContact({ ...f, accountId: f.accountId || null }), f.logSent ? "Logged — follow-up scheduled" : "Contact added");
    if (r) {
      setF({ ...blank, channel: f.channel, accountId: f.accountId });
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log outreach"
      subtitle="Who you messaged, where, and from which of your accounts."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={pending || (!f.name && !f.handle)}>{f.logSent ? "Log message" : "Add contact"}</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Channel" required>
          <Select value={f.channel} onChange={(e) => { set("channel", e.target.value); set("accountId", ""); }}>
            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
        </Field>
        <Field label="Sent from account">
          <AccountSelect accounts={accounts} channel={f.channel} value={f.accountId} onChange={(v) => set("accountId", v)} />
        </Field>
        <Field label="Name" required>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Doe" />
        </Field>
        <Field label={f.channel === "whatsapp" || f.channel === "phone" ? "Phone number" : f.channel === "email" ? "Email address" : "Profile / handle"}>
          <Input value={f.handle} onChange={(e) => set("handle", e.target.value)} placeholder={hint} />
        </Field>
        <Field label="Company">
          <Input value={f.company} onChange={(e) => set("company", e.target.value)} />
        </Field>
        <Field label="Title">
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Source / list" className="sm:col-span-2" hint="Where you found them, e.g. “Facebook group — Shopify owners”.">
          <Input value={f.source} onChange={(e) => set("source", e.target.value)} />
        </Field>
        <label className="flex items-center gap-3 text-[14px] sm:col-span-2">
          <input type="checkbox" checked={f.logSent} onChange={(e) => set("logSent", e.target.checked)} className="h-4 w-4 accent-[rgb(var(--ink))]" />
          I already sent the first message
        </label>
        {f.logSent && (
          <Field label="Message sent" className="sm:col-span-2">
            <Textarea value={f.firstMessage} onChange={(e) => set("firstMessage", e.target.value)} placeholder="Paste what you sent (optional)" />
          </Field>
        )}
      </div>
    </Modal>
  );
}

const EVENTS: { ev: ContactEvent; label: string; icon: typeof Send }[] = [
  { ev: "followup", label: "Follow-up sent", icon: Send },
  { ev: "reply", label: "They replied", icon: Reply },
  { ev: "sent", label: "Message sent", icon: MessageSquarePlus },
  { ev: "note", label: "Note", icon: StickyNote },
];

function ContactDrawer({ contact: c, accounts, onClose }: { contact: LogContact; accounts: LogAccount[]; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const [version, setVersion] = useState(0);
  const [ev, setEv] = useState<ContactEvent>(c.lastOutboundAt ? "followup" : "sent");
  const [text, setText] = useState("");
  const [acc, setAcc] = useState(c.accountId ?? "");
  const [editing, setEditing] = useState(false);
  const [meetingAt, setMeetingAt] = useState("");
  const bump = () => setVersion((v) => v + 1);

  const log = async () => {
    const r = await run(() => logContactTouch(c.id, ev, { text, accountId: acc || null }), ev === "note" ? "Note saved" : "Logged");
    if (r) {
      setText("");
      bump();
    }
  };
  const stage = async (s: ContactStage) => {
    if (await run(() => setLogContactStage(c.id, s, { meetingAt: s === "meeting" && meetingAt ? new Date(meetingAt).toISOString() : undefined }), `Moved to ${CONTACT_STAGE_LABEL[s]}`)) bump();
  };

  return (
    <Drawer open onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[24px] font-medium tracking-[-0.015em]">{c.name}</h2>
            <p className="mt-1.5 text-[13.5px] text-neutral-500">{[c.title, c.company].filter(Boolean).join(" · ")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StagePill kind="contact" stage={c.stage} />
              <ChannelTag channel={c.channel} account={accounts.find((a) => a.id === c.accountId)?.label} />
              {c.handle && <span className="select-all text-[13px] text-neutral-500">{c.handle}</span>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 rounded-[20px] bg-page p-5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.05em] text-neutral-400">Next follow-up</p>
            <div className="mt-2 flex items-center gap-2">
              <DueText at={c.nextFollowupAt} className="text-[15px]" />
            </div>
            <input
              type="datetime-local"
              className="mt-3 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[13px]"
              defaultValue={c.nextFollowupAt ? toLocalInput(new Date(c.nextFollowupAt)) : ""}
              onBlur={(e) => {
                const v = e.target.value;
                const cur = c.nextFollowupAt ? toLocalInput(new Date(c.nextFollowupAt)) : "";
                if (v !== cur) void run(() => setLogContactFollowup(c.id, v ? new Date(v).toISOString() : null), "Follow-up date set");
              }}
            />
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.05em] text-neutral-400">Follow-ups sent</p>
            <p className="mt-2 text-[22px] tabular-nums">{c.followupCount}</p>
          </div>
        </div>

        <section className="mt-8">
          <p className="mb-3 text-[13px] text-neutral-500">Log what happened</p>
          <div className="flex flex-wrap gap-2">
            {EVENTS.map((e) => (
              <button
                key={e.ev}
                type="button"
                onClick={() => setEv(e.ev)}
                className={cn("inline-flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors", ev === e.ev ? "bg-ink text-white" : "bg-page hover:bg-neutral-200/80")}
              >
                <e.icon className="h-4 w-4" strokeWidth={1.8} />
                {e.label}
              </button>
            ))}
          </div>
          {ev !== "reply" && ev !== "note" && (
            <div className="mt-4">
              <AccountSelect accounts={accounts} channel={c.channel} value={acc} onChange={setAcc} />
            </div>
          )}
          <Textarea className="mt-4" value={text} onChange={(e) => setText(e.target.value)} placeholder={ev === "reply" ? "Paste their reply (optional)" : ev === "note" ? "Note" : "What you sent (optional)"} />
          <div className="mt-4 flex justify-end">
            <Button onClick={log} disabled={pending || (ev === "note" && !text.trim())}>Save</Button>
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-[13px] text-neutral-500">Set stage</p>
          <div className="flex flex-wrap gap-2">
            {(["interested", "meeting", "won", "lost", "no_response"] as ContactStage[]).map((s) => (
              <Button key={s} size="sm" variant={c.stage === s ? "primary" : "secondary"} disabled={pending} onClick={() => stage(s)}>
                {CONTACT_STAGE_LABEL[s]}
              </Button>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-3 text-[13px] text-neutral-500">
            Meeting time
            <input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className="h-9 rounded-lg border border-black/[0.08] px-3 text-[13px]" />
          </label>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[15px] font-medium">Timeline</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!confirm(`Delete ${c.name} and their history?`)) return;
                  if (await run(() => deleteLogContact(c.id), "Deleted")) onClose();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Timeline kind="contact" id={c.id} version={version + (c.updatedAt ? new Date(c.updatedAt).getTime() : 0)} />
        </section>
      </div>
      {editing && <EditContactModal contact={c} accounts={accounts} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

function EditContactModal({ contact: c, accounts, onClose }: { contact: LogContact; accounts: LogAccount[]; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const [f, setF] = useState({ name: c.name, channel: c.channel, handle: c.handle, company: c.company, title: c.title, accountId: c.accountId ?? "", source: c.source, notes: c.notes ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit contact"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={async () => (await run(() => updateLogContact(c.id, { ...f, accountId: f.accountId || null }), "Saved")) && onClose()}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Channel">
          <Select value={f.channel} onChange={(e) => { set("channel", e.target.value); set("accountId", ""); }}>
            {CHANNELS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Handle"><Input value={f.handle} onChange={(e) => set("handle", e.target.value)} /></Field>
        <Field label="Account"><AccountSelect accounts={accounts} channel={f.channel} value={f.accountId} onChange={(v) => set("accountId", v)} /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Title"><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Source" className="sm:col-span-2"><Input value={f.source} onChange={(e) => set("source", e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
