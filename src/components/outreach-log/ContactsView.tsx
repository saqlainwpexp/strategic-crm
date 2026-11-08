"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, MessageSquarePlus, MessagesSquare, Plus, Reply, Send, StickyNote, Trash2, X } from "lucide-react";
import type { LogAccount, LogCampaign, LogContact } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea, SearchInput } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils";
import { CHANNELS, CONTACT_STAGES, CONTACT_STAGE_LABEL, channelLabel, type ContactEvent, type ContactStage } from "@/lib/outreach-log/constants";
import {
  bulkSetLogCampaign,
  createLogContact,
  deleteLogContact,
  logContactTouch,
  setLogContactFollowup,
  setLogContactStage,
  updateLogContact,
} from "@/server/outreach-log/actions";
import { AccountSelect, CampaignChip, CampaignSelect, ChannelTag, DueText, StagePill, Tags, Timeline, toLocalInput, useLogAction } from "./shared";
import { CampaignsModal } from "./CampaignsModal";

type Filter = "all" | "due" | "active" | "closed";
/** "" = all campaigns, "none" = not in a campaign, otherwise a campaign id. */
type Pool = string;

export function ContactsView({ contacts, accounts, campaigns }: { contacts: LogContact[]; accounts: LogAccount[]; campaigns: LogCampaign[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { run, pending } = useLogAction();
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [pool, setPool] = useState<Pool>("");
  const [channel, setChannel] = useState("");
  const [accountId, setAccountId] = useState("");
  const [stage, setStage] = useState("");
  const [tag, setTag] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (params.get("new")) setAdding(true);
    const id = params.get("contact");
    if (id) setOpenId(id);
    const c = params.get("campaign");
    if (c) setPool(c);
  }, [params]);

  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.label ?? null;
  const campaignOf = (id: string | null) => campaigns.find((c) => c.id === id) ?? null;
  const endOfDay = new Date().setHours(23, 59, 59, 999);
  const isDue = (c: LogContact) => !!c.nextFollowupAt && new Date(c.nextFollowupAt).getTime() <= endOfDay;
  const closed = (c: LogContact) => ["won", "lost", "no_response"].includes(c.stage);
  const inPool = (c: LogContact) => (pool === "" ? true : pool === "none" ? !c.campaignId : c.campaignId === pool);

  const pooled = useMemo(() => contacts.filter(inPool), [contacts, pool]); // eslint-disable-line react-hooks/exhaustive-deps
  const allTags = useMemo(() => [...new Set(pooled.flatMap((c) => c.tags.split(",").map((t) => t.trim()).filter(Boolean)))].sort(), [pooled]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return pooled
      .filter((c) => (filter === "due" ? isDue(c) : filter === "active" ? !closed(c) : filter === "closed" ? closed(c) : true))
      .filter((c) => !channel || c.channel === channel)
      .filter((c) => !accountId || c.accountId === accountId)
      .filter((c) => !stage || c.stage === stage)
      .filter((c) => !tag || c.tags.split(",").map((t) => t.trim()).includes(tag))
      .filter((c) => !term || [c.name, c.company, c.handle, c.title, c.tags].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => (a.nextFollowupAt ? new Date(a.nextFollowupAt).getTime() : Infinity) - (b.nextFollowupAt ? new Date(b.nextFollowupAt).getTime() : Infinity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pooled, q, filter, channel, accountId, stage, tag]);

  // Per-campaign stats for the active pool.
  const stats = useMemo(() => {
    const contacted = pooled.filter((c) => c.lastOutboundAt).length;
    const replied = pooled.filter((c) => c.lastInboundAt).length;
    const won = pooled.filter((c) => c.stage === "won").length;
    return { total: pooled.length, contacted, replied, won, rate: contacted ? Math.round((replied / contacted) * 100) : 0 };
  }, [pooled]);

  const open = contacts.find((c) => c.id === openId) ?? null;
  const close = () => {
    setOpenId(null);
    if (params.get("contact")) router.replace("/log/outreach");
  };
  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const moveTo = async (campaignId: string) => {
    const ids = [...picked];
    const name = campaignId ? campaignOf(campaignId)?.name : "no campaign";
    if (await run(() => bulkSetLogCampaign(ids, campaignId || null), `Moved ${ids.length} to ${name}`)) setPicked(new Set());
  };
  const current = pool && pool !== "none" ? campaignOf(pool) : null;

  return (
    <div>
      <PageHeader
        title="Outreach"
        subtitle="Every WhatsApp, email and DM you send, kept apart by campaign. Stages and follow-ups update automatically."
        actions={
          <>
            <Button variant="secondary" onClick={() => setManaging(true)}>
              <FolderKanban className="h-4 w-4" strokeWidth={1.8} />
              Campaigns
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" strokeWidth={2} />
              Log outreach
            </Button>
          </>
        }
      />

      {/* Campaign pools */}
      <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
        {[
          { id: "", name: "All outreach", color: "", count: contacts.length },
          ...campaigns.filter((c) => c.active || c.id === pool).map((c) => ({ id: c.id, name: c.name, color: c.color, count: contacts.filter((x) => x.campaignId === c.id).length })),
          { id: "none", name: "No campaign", color: "", count: contacts.filter((x) => !x.campaignId).length },
        ].map((p) => (
          <button
            key={p.id || "all"}
            type="button"
            onClick={() => {
              setPool(p.id);
              setPicked(new Set());
              setTag("");
            }}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2.5 rounded-full px-5 text-[14px] transition-colors",
              pool === p.id ? "bg-ink text-white" : "bg-white text-ink hover:bg-neutral-100"
            )}
          >
            {p.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />}
            {p.name}
            <span className={cn("tabular-nums", pool === p.id ? "text-white/60" : "text-neutral-400")}>{p.count}</span>
          </button>
        ))}
        <button type="button" onClick={() => setManaging(true)} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-dashed border-black/15 px-5 text-[14px] text-neutral-500 hover:text-ink">
          <Plus className="h-4 w-4" /> New campaign
        </button>
      </div>

      {current?.description && <p className="-mt-4 mb-6 text-[13.5px] text-neutral-500">{current.description}</p>}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Contacts", stats.total],
          ["Contacted", stats.contacted],
          ["Reply rate", `${stats.rate}%`],
          ["Won", stats.won],
        ].map(([l, v]) => (
          <Card key={l as string}>
            <p className="text-[13px] text-neutral-500">{l}</p>
            <p className="mt-4 text-[28px] tabular-nums tracking-[-0.02em]">{v}</p>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: pooled.length },
            { value: "due", label: "Due", count: pooled.filter(isDue).length },
            { value: "active", label: "Active", count: pooled.filter((c) => !closed(c)).length },
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
        {allTags.length > 0 && (
          <select value={tag} onChange={(e) => setTag(e.target.value)} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
            <option value="">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>#{t}</option>
            ))}
          </select>
        )}
        <div className="ml-auto w-full sm:w-[280px]">
          <SearchInput value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="Search name, company, handle, tag…" />
        </div>
      </div>

      {picked.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[18px] bg-ink px-5 py-3 text-white">
          <span className="text-[14px]">{picked.size} selected</span>
          <span className="text-[13px] text-white/60">Move to</span>
          <select
            disabled={pending}
            value=""
            onChange={(e) => e.target.value && void moveTo(e.target.value === "__none" ? "" : e.target.value)}
            className="h-9 rounded-full bg-white/10 px-4 text-[13px] text-white outline-none [&>option]:text-ink"
          >
            <option value="">Choose campaign…</option>
            {campaigns.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value="__none">No campaign</option>
          </select>
          <button type="button" onClick={() => setPicked(new Set())} className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white">
            <X className="h-4 w-4" /> Clear
          </button>
        </div>
      )}

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={pooled.length ? "Nothing matches these filters" : current ? `No one in “${current.name}” yet` : "No outreach logged yet"}
            body={pooled.length ? undefined : "Log a WhatsApp, email or DM and the follow-ups will be scheduled for you."}
            action={!pooled.length && <Button onClick={() => setAdding(true)}>Log outreach</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="text-[12.5px] uppercase tracking-[0.04em] text-neutral-400">
                  <th className="w-12 py-4 pl-6">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))}
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="px-4 py-4 font-normal">Contact</th>
                  <th className="px-4 py-4 font-normal">Campaign</th>
                  <th className="px-4 py-4 font-normal">Channel · account</th>
                  <th className="px-4 py-4 font-normal">Stage</th>
                  <th className="px-6 py-4 font-normal">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className={cn("cursor-pointer border-t border-black/[0.05] transition-colors hover:bg-page/60", picked.has(c.id) && "bg-page/70")}>
                    <td className="py-4 pl-6" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${c.name}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-[14.5px] font-medium">{c.name}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-neutral-500">{[c.title, c.company].filter(Boolean).join(" · ") || c.handle}</p>
                      <Tags tags={c.tags} className="mt-1.5" />
                    </td>
                    <td className="px-4 py-4"><CampaignChip campaign={campaignOf(c.campaignId)} /></td>
                    <td className="px-4 py-4"><ChannelTag channel={c.channel} account={accountName(c.accountId)} /></td>
                    <td className="px-4 py-4"><StagePill kind="contact" stage={c.stage} /></td>
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

      <AddContactModal
        open={adding}
        onClose={() => { setAdding(false); if (params.get("new")) router.replace("/log/outreach"); }}
        accounts={accounts}
        campaigns={campaigns}
        defaultCampaign={pool && pool !== "none" ? pool : ""}
      />
      {managing && <CampaignsModal campaigns={campaigns} counts={Object.fromEntries(campaigns.map((c) => [c.id, contacts.filter((x) => x.campaignId === c.id).length]))} onClose={() => setManaging(false)} />}
      {open && <ContactDrawer contact={open} accounts={accounts} campaigns={campaigns} onClose={close} />}
    </div>
  );
}

function AddContactModal({ open, onClose, accounts, campaigns, defaultCampaign }: { open: boolean; onClose: () => void; accounts: LogAccount[]; campaigns: LogCampaign[]; defaultCampaign: string }) {
  const { run, pending } = useLogAction();
  const blank = { name: "", channel: "whatsapp", handle: "", company: "", title: "", accountId: "", campaignId: defaultCampaign, tags: "", source: "", firstMessage: "", logSent: true, notes: "" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((p) => ({ ...p, [k]: v }));
  const hint = CHANNELS.find((c) => c.id === f.channel)?.handleHint ?? "";
  // Opening on a campaign tab pre-selects that campaign.
  useEffect(() => {
    if (open) setF((p) => ({ ...p, campaignId: defaultCampaign }));
  }, [open, defaultCampaign]);

  const save = async () => {
    const r = await run(() => createLogContact({ ...f, accountId: f.accountId || null, campaignId: f.campaignId || null }), f.logSent ? "Logged — follow-up scheduled" : "Contact added");
    if (r) {
      setF({ ...blank, channel: f.channel, accountId: f.accountId, campaignId: f.campaignId });
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
        <Field label="Campaign" className="sm:col-span-2" hint="Keeps each offer separate, e.g. “Free website offer” vs “SEO retainer”.">
          <CampaignSelect campaigns={campaigns} value={f.campaignId} onChange={(v) => set("campaignId", v)} />
        </Field>
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
        <Field label="Source / list" hint="Where you found them, e.g. “Facebook group — Shopify owners”.">
          <Input value={f.source} onChange={(e) => set("source", e.target.value)} />
        </Field>
        <Field label="Tags" hint="Comma-separated, e.g. shopify, us, hot">
          <Input value={f.tags} onChange={(e) => set("tags", e.target.value)} />
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

function ContactDrawer({ contact: c, accounts, campaigns, onClose }: { contact: LogContact; accounts: LogAccount[]; campaigns: LogCampaign[]; onClose: () => void }) {
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
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <CampaignSelect
                campaigns={campaigns}
                value={c.campaignId ?? ""}
                onChange={(v) => void run(() => updateLogContact(c.id, { campaignId: v || null }), v ? `Moved to ${campaigns.find((x) => x.id === v)?.name}` : "Removed from campaign")}
                className="h-9 w-auto rounded-full text-[13px]"
              />
              <Tags tags={c.tags} />
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
      {editing && <EditContactModal contact={c} accounts={accounts} campaigns={campaigns} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

function EditContactModal({ contact: c, accounts, campaigns, onClose }: { contact: LogContact; accounts: LogAccount[]; campaigns: LogCampaign[]; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const [f, setF] = useState({ name: c.name, channel: c.channel, handle: c.handle, company: c.company, title: c.title, accountId: c.accountId ?? "", campaignId: c.campaignId ?? "", tags: c.tags, source: c.source, notes: c.notes ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit contact"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={async () => (await run(() => updateLogContact(c.id, { ...f, accountId: f.accountId || null, campaignId: f.campaignId || null }), "Saved")) && onClose()}>Save</Button>
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
        <Field label="Campaign"><CampaignSelect campaigns={campaigns} value={f.campaignId} onChange={(v) => set("campaignId", v)} /></Field>
        <Field label="Tags"><Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="shopify, us" /></Field>
        <Field label="Source" className="sm:col-span-2"><Input value={f.source} onChange={(e) => set("source", e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
