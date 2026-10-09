"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  AtSign,
  ChevronDown,
  CircleAlert,
  Gauge,
  Globe,
  Inbox,
  ListPlus,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { PageHeader, EmptyState, StatCard } from "@/components/ui/Layout";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/date";
import { SMTP_PRESETS } from "@/lib/email";
import type { DomainCheck, EmailAccountView, EmailDomainView } from "@/lib/email-types";
import {
  addDomainAction,
  bulkAddInboxesAction,
  checkDomainAction,
  deleteDomainAction,
  deleteEmailAccountAction,
  saveEmailAccountAction,
  setEmailAccountPausedAction,
  testEmailAccountAction,
} from "@/server/email/actions";
import { ACCOUNT_STATUS, Eyebrow, Meter, TintPill, useEmailAction } from "./kit";

/**
 * Sending infrastructure: domains, each with a few inboxes, all feeding one rotation.
 * (Many domains × 2–3 inboxes each keeps every inbox's volume low and protects deliverability.)
 */
export function SendingView({ accounts, domains }: { accounts: EmailAccountView[]; domains: EmailDomainView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [editing, setEditing] = useState<EmailAccountView | "new" | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const { run, busy } = useEmailAction();

  useEffect(() => {
    if (params.get("new")) {
      setEditing("new");
      router.replace(pathname, { scroll: false });
    }
  }, [params, pathname, router]);

  const groups = useMemo(() => {
    const names = new Set([...domains.map((d) => d.domain), ...accounts.map((a) => a.domain)]);
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, dns: domains.find((d) => d.domain === name) ?? null, inboxes: accounts.filter((a) => a.domain === name) }));
  }, [accounts, domains]);

  const live = accounts.filter((a) => a.status === "CONNECTED" || a.status === "PENDING");
  const capacity = live.reduce((s, a) => s + a.dailyLimit, 0);
  const sentToday = accounts.reduce((s, a) => s + a.sentToday, 0);
  const attention = accounts.filter((a) => a.status === "ERROR").length;

  return (
    <div>
      <PageHeader
        title="Sending"
        subtitle="Your domains and their inboxes. Campaigns and workflows rotate across every connected inbox."
        actions={
          <>
            <Button variant="secondary" size="lg" onClick={() => setBulkOpen(true)}>
              <ListPlus className="h-4 w-4" /> Bulk add inboxes
            </Button>
            <Button size="lg" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add inbox
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-6 xl:grid-cols-4">
        <StatCard icon={Globe} label="Domains" value={groups.length} hint={`${domains.filter((d) => d.spf === "pass" && d.dmarc === "pass").length} with SPF & DMARC`} />
        <StatCard icon={Inbox} label="Inboxes" value={accounts.length} hint={attention ? `${attention} need attention` : `${live.length} sending`} />
        <StatCard icon={Gauge} label="Daily capacity" value={capacity.toLocaleString("en-US")} hint="Emails per day across inboxes" />
        <StatCard icon={Send} label="Sent today" value={sentToday.toLocaleString("en-US")} hint={capacity ? `${Math.round((sentToday / capacity) * 100)}% of capacity` : "—"} />
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={AtSign}
            title="Set up your sending infrastructure"
            body="Add your outreach domains and 2–3 inboxes on each. Spreading volume over many inboxes keeps each one well under spam thresholds."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                  <ListPlus className="h-4 w-4" /> Bulk add inboxes
                </Button>
                <Button onClick={() => setEditing("new")}>
                  <Plus className="h-4 w-4" /> Add inbox
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <DomainCard key={g.name} name={g.name} dns={g.dns} inboxes={g.inboxes} onEdit={setEditing} />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end">
          <Field label="Track another domain" className="flex-1" hint="Domains are added automatically with their first inbox — use this to check DNS before the inboxes exist.">
            <Input value={newDomain} placeholder="youragency-mail.com" onChange={(e) => setNewDomain(e.target.value)} />
          </Field>
          <Button
            size="lg"
            variant="secondary"
            disabled={!newDomain.trim() || busy === "add"}
            onClick={() => run("add", addDomainAction(newDomain), "Domain added and checked").then((r) => r !== null && setNewDomain(""))}
          >
            <Globe className="h-4 w-4" /> {busy === "add" ? "Checking DNS…" : "Add & check DNS"}
          </Button>
        </div>
      </Card>

      <AccountModal account={editing} onClose={() => setEditing(null)} />
      <BulkModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}

const CHECK: Record<DomainCheck, { label: string; color: string }> = {
  pass: { label: "Verified", color: "#1F9D4C" },
  warn: { label: "Check", color: "#D97706" },
  fail: { label: "Missing", color: "#E5484D" },
  pending: { label: "Not checked", color: "#A3A3A3" },
};

function DomainCard({ name, dns, inboxes, onEdit }: { name: string; dns: EmailDomainView | null; inboxes: EmailAccountView[]; onEdit: (a: EmailAccountView) => void }) {
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [showDns, setShowDns] = useState(false);
  const capacity = inboxes.filter((a) => a.status !== "DISCONNECTED" && a.status !== "ERROR").reduce((s, a) => s + a.dailyLimit, 0);

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-4 px-7 py-6">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-page">
          <Globe className="h-5 w-5" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-medium tracking-[-0.01em]">{name}</p>
          <p className="mt-1 text-[13px] text-neutral-500">
            {inboxes.length} inbox{inboxes.length === 1 ? "" : "es"} · {capacity.toLocaleString("en-US")}/day
            {dns?.lastCheckedAt ? ` · DNS checked ${relativeTime(dns.lastCheckedAt)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["spf", "dkim", "dmarc"] as const).map((k) => {
            const s = CHECK[dns?.[k] ?? "pending"];
            return (
              <TintPill key={k} color={s.color}>
                {k.toUpperCase()}
              </TintPill>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {dns ? (
            <Button variant="ghost" size="sm" disabled={busy === "dns"} onClick={() => run("dns", checkDomainAction(dns.id), "DNS checked")}>
              <RefreshCw className={cn("h-3.5 w-3.5", busy === "dns" && "animate-spin")} /> Check DNS
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled={busy === "dns"} onClick={() => run("dns", addDomainAction(name), "DNS checked")}>
              <ShieldCheck className="h-3.5 w-3.5" /> Check DNS
            </Button>
          )}
          {dns && (
            <IconButton label={showDns ? "Hide DNS details" : "Show DNS details"} size="sm" onClick={() => setShowDns((v) => !v)}>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showDns && "rotate-180")} />
            </IconButton>
          )}
          {dns && inboxes.length === 0 && (
            <IconButton label="Remove domain" size="sm" onClick={() => confirm({ title: `Remove ${name}?`, confirmLabel: "Remove", danger: true, run: () => run("del", deleteDomainAction(dns.id), "Domain removed") })}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </div>

      {showDns && dns && (
        <div className="grid grid-cols-1 gap-4 border-t border-neutral-100 px-7 py-6 lg:grid-cols-3">
          <DnsCheck
            name="SPF"
            status={dns.spf}
            what="Lists the servers allowed to send for your domain."
            fix={
              dns.spf === "pass"
                ? dns.details?.spfRecord
                : dns.spf === "warn"
                  ? `Your SPF record doesn't include ${dns.details?.spfInclude}. Add “include:${dns.details?.spfInclude}” before ~all.`
                  : `Add a TXT record on ${dns.domain}: v=spf1 include:${dns.details?.spfInclude ?? "your-provider"} ~all`
            }
          />
          <DnsCheck
            name="DKIM"
            status={dns.dkim}
            what="Signs each email so it can't be forged."
            fix={
              dns.dkim === "pass"
                ? `Found under the “${dns.details?.dkimSelector}” selector.`
                : `Turn on DKIM in your ${dns.details?.provider ?? "email provider"}'s settings (Hostinger: hPanel → Emails → your domain → Authentication). If it's already on with a custom selector, you can ignore this.`
            }
          />
          <DnsCheck
            name="DMARC"
            status={dns.dmarc}
            what="Tells inboxes what to do with emails that fail SPF/DKIM."
            fix={dns.dmarc === "pass" ? dns.details?.dmarcRecord : `Add a TXT record on _dmarc.${dns.domain}: v=DMARC1; p=none; rua=mailto:dmarc@${dns.domain}`}
          />
        </div>
      )}

      {inboxes.length > 0 && (
        <div className="overflow-x-auto border-t border-neutral-100">
          <table className="w-full min-w-[860px] border-collapse">
            <tbody className="text-[13px]">
              {inboxes.map((a) => {
                const st = ACCOUNT_STATUS[a.status];
                const paused = a.status === "DISCONNECTED";
                return (
                  <tr key={a.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-4 pl-7 pr-4">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page text-[13px] font-medium uppercase">{a.email.slice(0, 1)}</span>
                        <div className="min-w-0">
                          <p className="max-w-[280px] truncate font-medium">{a.email}</p>
                          <p className="mt-0.5 max-w-[280px] truncate text-[11.5px] text-neutral-500">
                            {a.fromName} · {a.provider}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-2 w-2 rounded-[2px]" style={{ background: st.color }} />
                        {st.label}
                      </span>
                      {a.lastError && (
                        <p className="mt-1 flex max-w-[260px] items-start gap-1 text-[11.5px] text-rose-600" title={a.lastError}>
                          <CircleAlert className="mt-px h-3 w-3 shrink-0" />
                          <span className="line-clamp-2">{a.lastError}</span>
                        </p>
                      )}
                    </td>
                    <td className="w-[180px] py-4 pr-6">
                      <p className="text-[12px] tabular-nums text-neutral-600">
                        {a.sentToday} / {a.dailyLimit} today
                      </p>
                      <Meter className="mt-2" value={a.sentToday} max={a.dailyLimit} />
                    </td>
                    <td className="whitespace-nowrap py-4 pr-4 text-neutral-600">
                      every {a.minDelaySec >= 60 ? `${Math.round(a.minDelaySec / 60)} min` : `${a.minDelaySec}s`}
                      <p className="mt-0.5 text-[11.5px] text-neutral-500">{a.imapEnabled ? (a.lastSyncAt ? `Replies synced ${relativeTime(a.lastSyncAt)}` : "Replies sync on") : "Replies off"}</p>
                    </td>
                    <td className="py-4 pr-7">
                      <div className="flex justify-end gap-1.5">
                        <IconButton
                          label="Test connection"
                          size="sm"
                          disabled={busy === `t${a.id}`}
                          onClick={() => run(`t${a.id}`, testEmailAccountAction(a.id), (r) => (r.smtp ? "Couldn't connect — see the inbox row" : r.imap ? "Sending works; reading replies failed" : "Connected"))}
                        >
                          <Zap className={cn("h-4 w-4", busy === `t${a.id}` && "animate-pulse")} />
                        </IconButton>
                        <IconButton label={paused ? "Resume" : "Pause"} size="sm" onClick={() => run(`p${a.id}`, setEmailAccountPausedAction(a.id, !paused), paused ? "Inbox resumed" : "Inbox paused")}>
                          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                        </IconButton>
                        <IconButton label="Edit" size="sm" onClick={() => onEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Remove inbox"
                          size="sm"
                          onClick={() =>
                            confirm({
                              title: `Remove ${a.email}?`,
                              body: "Its synced replies leave the Inbox. Your real mailbox isn't touched, and sent-email stats are kept.",
                              confirmLabel: "Remove inbox",
                              danger: true,
                              run: () => run("del", deleteEmailAccountAction(a.id), "Inbox removed"),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dialog}
    </Card>
  );
}

function BulkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, busy } = useEmailAction();
  const [provider, setProvider] = useState(SMTP_PRESETS[0].label);
  const preset = SMTP_PRESETS.find((p) => p.label === provider) ?? SMTP_PRESETS[0];
  const [smtpHost, setSmtpHost] = useState(preset.smtpHost);
  const [smtpPort, setSmtpPort] = useState(preset.smtpPort);
  const [imapHost, setImapHost] = useState(preset.imapHost);
  const [imapEnabled, setImapEnabled] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(40);
  const [minDelaySec, setMinDelaySec] = useState(90);
  const [fromName, setFromName] = useState("");
  const [lines, setLines] = useState("");
  const [results, setResults] = useState<{ email: string; ok: boolean; error?: string }[] | null>(null);
  const count = lines.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  const close = () => {
    setResults(null);
    setLines("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk add inboxes"
      subtitle="Paste one inbox per line. Every inbox is tested; passwords are stored encrypted."
      className="max-w-[760px]"
      footer={
        results ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!count || !smtpHost || busy === "bulk"}
              onClick={async () => {
                const r = await run(
                  "bulk",
                  bulkAddInboxesAction({ provider, smtpHost, smtpPort, imapHost, imapPort: 993, imapEnabled, dailyLimit, minDelaySec, defaultFromName: fromName, lines }),
                  (d) => `${d.added} inbox${d.added === 1 ? "" : "es"} added`
                );
                if (r) setResults(r.results);
              }}
            >
              {busy === "bulk" ? `Adding & testing ${count}…` : `Add ${count || ""} inbox${count === 1 ? "" : "es"}`}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <ul className="flex flex-col gap-2">
          {results.map((r) => (
            <li key={r.email} className={cn("flex items-start justify-between gap-4 rounded-2xl px-4 py-3 text-[13px]", r.ok ? "bg-[#E9F8EE]" : "bg-rose-50")}>
              <span className="font-medium">{r.email}</span>
              <span className={r.ok ? "text-[#1F9D4C]" : "text-right text-rose-700"}>{r.ok ? "Connected" : r.error}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {SMTP_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setProvider(p.label);
                  if (p.label !== "Custom") {
                    setSmtpHost(p.smtpHost);
                    setSmtpPort(p.smtpPort);
                    setImapHost(p.imapHost);
                  }
                }}
                className={cn("h-10 rounded-full px-4 text-[13px] transition-colors", provider === p.label ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200/70")}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px_1fr]">
            <Field label="SMTP host">
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
            </Field>
            <Field label="Port">
              <Select value={String(smtpPort)} onChange={(e) => setSmtpPort(Number(e.target.value))}>
                <option value="465">465 (SSL)</option>
                <option value="587">587 (TLS)</option>
              </Select>
            </Field>
            <Field label="IMAP host">
              <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} />
            </Field>
          </div>
          <Field
            label="Inboxes"
            hint="Format: email, password, From Name (optional). Lines starting with # are ignored. Usernames are the full email address."
          >
            <Textarea
              value={lines}
              onChange={(e) => setLines(e.target.value)}
              spellCheck={false}
              className="min-h-[180px] font-mono text-[12.5px]"
              placeholder={"alex@getstrategic.com, password1, Alex Carter\nalex@trystrategic.com, password2\nsam@strategic-web.com, password3, Sam Lee"}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <Field label="Default From name">
              <Input value={fromName} placeholder="Alex Carter" onChange={(e) => setFromName(e.target.value)} />
            </Field>
            <Field label="Daily limit per inbox" hint="30–50 is safe for cold email.">
              <Input type="number" min={1} max={5000} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <Field label="Seconds between emails">
              <Input type="number" min={5} max={3600} value={minDelaySec} onChange={(e) => setMinDelaySec(Math.max(5, Number(e.target.value) || 5))} />
            </Field>
          </div>
          <Toggle checked={imapEnabled} onChange={setImapEnabled} label="Sync replies from these inboxes to the Inbox" />
          <p className="text-[12px] leading-relaxed text-neutral-500">
            The passwords you paste are sent once over HTTPS and stored encrypted — they're never shown again.
          </p>
        </div>
      )}
    </Modal>
  );
}

type AccountForm = {
  name: string;
  email: string;
  fromName: string;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  password: string;
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  dailyLimit: number;
  minDelaySec: number;
  signature: string;
};

const blank = (): AccountForm => ({
  name: "",
  email: "",
  fromName: "",
  provider: "Hostinger",
  smtpHost: "smtp.hostinger.com",
  smtpPort: 465,
  smtpUser: "",
  password: "",
  imapEnabled: true,
  imapHost: "imap.hostinger.com",
  imapPort: 993,
  dailyLimit: 40,
  minDelaySec: 90,
  signature: "",
});

function AccountModal({ account, onClose }: { account: EmailAccountView | "new" | null; onClose: () => void }) {
  const { run, busy } = useEmailAction();
  const [f, setF] = useState<AccountForm>(blank);
  const [userTouched, setUserTouched] = useState(false);
  const editing = account && account !== "new" ? account : null;

  useEffect(() => {
    if (!account) return;
    if (account === "new") {
      setF(blank());
      setUserTouched(false);
    } else {
      setF({ ...account, password: "" });
      setUserTouched(true);
    }
  }, [account]);

  const set = <K extends keyof AccountForm>(k: K, v: AccountForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const preset = SMTP_PRESETS.find((p) => p.label === f.provider) ?? SMTP_PRESETS[SMTP_PRESETS.length - 1];

  const save = async () => {
    const res = await run("save", saveEmailAccountAction({ id: editing?.id, ...f }));
    if (!res) return;
    if (res.smtp) return; // keep the modal open; card shows the error after refresh too
    onClose();
  };

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={editing ? `Edit ${editing.email}` : "Add a mailbox"}
      subtitle="We connect over SMTP to send and IMAP to read replies. The password is stored encrypted."
      className="max-w-[720px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy === "save" || !f.email || !f.smtpHost || (!editing && !f.password)}>
            {busy === "save" ? "Connecting…" : editing ? "Save & test" : "Connect mailbox"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-7">
        <div>
          <p className="mb-3 text-[13px] text-neutral-600">Provider</p>
          <div className="flex flex-wrap gap-2">
            {SMTP_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  setF((prev) => ({
                    ...prev,
                    provider: p.label,
                    ...(p.label !== "Custom" ? { smtpHost: p.smtpHost, smtpPort: p.smtpPort, imapHost: p.imapHost } : {}),
                  }))
                }
                className={cn(
                  "h-10 rounded-full px-4 text-[13px] transition-colors",
                  f.provider === p.label ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200/70"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset.note && <p className="mt-3 text-[12.5px] leading-relaxed text-neutral-500">{preset.note}</p>}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Email address" required>
            <Input
              type="email"
              value={f.email}
              placeholder="alex@youragency.com"
              onChange={(e) => {
                const v = e.target.value;
                setF((p) => ({ ...p, email: v, ...(!userTouched ? { smtpUser: v } : {}), ...(!p.name || p.name === p.email ? { name: v } : {}) }));
              }}
            />
          </Field>
          <Field label="From name" required hint="What recipients see, e.g. “Alex from Strategic”.">
            <Input value={f.fromName} placeholder="Alex Carter" onChange={(e) => set("fromName", e.target.value)} />
          </Field>
          <Field label="Label" hint="Only you see this.">
            <Input value={f.name} placeholder="Alex — outreach" onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Password" required={!editing} hint={editing ? "Leave blank to keep the saved password." : undefined}>
            <Input type="password" autoComplete="new-password" value={f.password} placeholder={editing ? "••••••••" : ""} onChange={(e) => set("password", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-2xl bg-soft p-5">
          <Eyebrow className="mb-4">Sending (SMTP)</Eyebrow>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px]">
            <Field label="SMTP host" required>
              <Input value={f.smtpHost} onChange={(e) => set("smtpHost", e.target.value)} />
            </Field>
            <Field label="Port">
              <Select value={String(f.smtpPort)} onChange={(e) => set("smtpPort", Number(e.target.value))}>
                <option value="465">465 (SSL)</option>
                <option value="587">587 (TLS)</option>
                <option value="25">25</option>
                <option value="2525">2525</option>
              </Select>
            </Field>
            <Field label="Username" className="sm:col-span-2" hint="Usually the full email address.">
              <Input
                value={f.smtpUser}
                onChange={(e) => {
                  setUserTouched(true);
                  set("smtpUser", e.target.value);
                }}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl bg-soft p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow>Replies (IMAP)</Eyebrow>
            <Toggle checked={f.imapEnabled} onChange={(v) => set("imapEnabled", v)} label="Sync replies to the Inbox" />
          </div>
          {f.imapEnabled && (
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_140px]">
              <Field label="IMAP host" hint="Leave blank to guess from the SMTP host.">
                <Input value={f.imapHost} onChange={(e) => set("imapHost", e.target.value)} />
              </Field>
              <Field label="Port">
                <Select value={String(f.imapPort)} onChange={(e) => set("imapPort", Number(e.target.value))}>
                  <option value="993">993 (SSL)</option>
                  <option value="143">143</option>
                </Select>
              </Field>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Daily sending limit" hint="New mailboxes: start around 30–50/day and raise it slowly.">
            <Input type="number" min={1} max={5000} value={f.dailyLimit} onChange={(e) => set("dailyLimit", Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Seconds between emails" hint="Spacing emails out looks human and protects deliverability.">
            <Input type="number" min={5} max={3600} value={f.minDelaySec} onChange={(e) => set("minDelaySec", Math.max(5, Number(e.target.value) || 5))} />
          </Field>
        </div>

        <Field label="Signature" hint="Added under every email from this mailbox. Simple HTML is fine (e.g. <b>, <br>, links).">
          <Textarea value={f.signature} placeholder={"Alex Carter\nStrategic Core Solutions"} onChange={(e) => set("signature", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function DnsCheck({ name, status, what, fix }: { name: string; status: DomainCheck; what: string; fix?: string }) {
  const s = CHECK[status];
  return (
    <div className="rounded-2xl bg-soft p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-medium">{name}</p>
        <TintPill color={s.color}>{s.label}</TintPill>
      </div>
      <p className="mt-2 text-[12.5px] text-neutral-500">{what}</p>
      {fix && <p className={cn("mt-4 break-words text-[12.5px] leading-relaxed", status === "pass" ? "font-mono text-neutral-600" : "text-ink")}>{fix}</p>}
    </div>
  );
}
