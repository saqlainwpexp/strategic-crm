"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AtSign,
  CircleAlert,
  Globe,
  Inbox,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/date";
import { SMTP_PRESETS } from "@/lib/email";
import type { DomainCheck, EmailAccountView, EmailDomainView } from "@/lib/email-types";
import {
  addDomainAction,
  checkDomainAction,
  deleteDomainAction,
  deleteEmailAccountAction,
  saveEmailAccountAction,
  setEmailAccountPausedAction,
  testEmailAccountAction,
} from "@/server/email/actions";
import { ACCOUNT_STATUS, Eyebrow, Meter, TintPill, useEmailAction } from "./kit";

type Tab = "mailboxes" | "domains";

export function SendingView({ accounts, domains }: { accounts: EmailAccountView[]; domains: EmailDomainView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "domains" ? "domains" : "mailboxes";
  const [editing, setEditing] = useState<EmailAccountView | "new" | null>(params.get("new") ? "new" : null);

  return (
    <div>
      <PageHeader
        title="Sending"
        subtitle="The mailboxes your emails go out from, and the domains behind them."
        actions={
          tab === "mailboxes" ? (
            <Button size="lg" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add mailbox
            </Button>
          ) : undefined
        }
      />
      <Segmented
        className="mb-6"
        value={tab}
        onChange={(t) => router.replace(t === "mailboxes" ? pathname : `${pathname}?tab=${t}`, { scroll: false })}
        options={[
          { value: "mailboxes", label: "Mailboxes", count: accounts.length },
          { value: "domains", label: "Domains", count: domains.length },
        ]}
      />
      {tab === "mailboxes" ? <Mailboxes accounts={accounts} onEdit={setEditing} /> : <Domains domains={domains} />}
      <AccountModal account={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ─── Mailboxes ───────────────────────────────────────────────

function Mailboxes({ accounts, onEdit }: { accounts: EmailAccountView[]; onEdit: (a: EmailAccountView | "new") => void }) {
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();

  if (!accounts.length) {
    return (
      <Card>
        <EmptyState
          icon={AtSign}
          title="Connect your first mailbox"
          body="Add the email account you want campaigns to go out from — for example a Hostinger mailbox on your domain. Replies to it show up in the Inbox."
          action={
            <Button onClick={() => onEdit("new")}>
              <Plus className="h-4 w-4" /> Add mailbox
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {accounts.map((a) => {
          const st = ACCOUNT_STATUS[a.status];
          const paused = a.status === "DISCONNECTED";
          return (
            <Card key={a.id} className="flex flex-col">
              <div className="flex items-start gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-page text-[17px] font-medium uppercase text-ink">
                  {a.email.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium tracking-[-0.01em]">{a.name}</p>
                  <p className="mt-1 truncate text-[13px] text-neutral-500">
                    {a.fromName} &lt;{a.email}&gt;
                  </p>
                </div>
                <TintPill color={st.color}>{st.label}</TintPill>
              </div>

              {a.lastError && (
                <div className="mt-5 flex gap-3 rounded-2xl bg-rose-50 px-4 py-3.5 text-[13px] leading-relaxed text-rose-700">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{a.lastError}</span>
                </div>
              )}

              <div className="mt-6 grid grid-cols-3 gap-4 rounded-2xl bg-soft p-5">
                <div>
                  <Eyebrow>Sent today</Eyebrow>
                  <p className="mt-2 text-[20px] tabular-nums tracking-[-0.01em]">
                    {a.sentToday}
                    <span className="text-[13px] text-neutral-500"> / {a.dailyLimit}</span>
                  </p>
                  <Meter className="mt-2.5 bg-white" value={a.sentToday} max={a.dailyLimit} />
                </div>
                <div>
                  <Eyebrow>Pace</Eyebrow>
                  <p className="mt-2 text-[20px] tabular-nums tracking-[-0.01em]">
                    {a.minDelaySec >= 60 ? `${Math.round(a.minDelaySec / 60)}m` : `${a.minDelaySec}s`}
                  </p>
                  <p className="mt-1 text-[12px] text-neutral-500">between emails</p>
                </div>
                <div>
                  <Eyebrow>All-time sent</Eyebrow>
                  <p className="mt-2 text-[20px] tabular-nums tracking-[-0.01em]">{a.totalSent.toLocaleString("en-US")}</p>
                  <p className="mt-1 text-[12px] text-neutral-500">{a.provider}</p>
                </div>
              </div>

              <p className="mt-5 flex items-center gap-2 text-[13px] text-neutral-500">
                <Inbox className="h-4 w-4" strokeWidth={1.8} />
                {a.imapEnabled
                  ? a.lastSyncAt
                    ? `Replies synced ${relativeTime(a.lastSyncAt)}`
                    : "Replies will sync every 2 minutes"
                  : "Reply syncing is off"}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-5">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy === `test${a.id}`}
                  onClick={() =>
                    run(`test${a.id}`, testEmailAccountAction(a.id), (r) =>
                      r.smtp ? "Couldn't connect — see the message on the card" : r.imap ? "Sending works; reading replies failed" : "Connected — sending and replies both work"
                    )
                  }
                >
                  <Zap className="h-3.5 w-3.5" /> {busy === `test${a.id}` ? "Testing…" : "Test connection"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(a)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy === `pause${a.id}`}
                  onClick={() => run(`pause${a.id}`, setEmailAccountPausedAction(a.id, !paused), paused ? "Mailbox resumed" : "Mailbox paused")}
                >
                  {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {paused ? "Resume" : "Pause"}
                </Button>
                <IconButton
                  label="Remove mailbox"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    confirm({
                      title: `Remove ${a.email}?`,
                      body: "Its synced replies are removed from the Inbox. Your real mailbox isn't touched, and emails already sent keep their stats.",
                      confirmLabel: "Remove mailbox",
                      danger: true,
                      run: () => run("del", deleteEmailAccountAction(a.id), "Mailbox removed"),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
            </Card>
          );
        })}
      </div>
      {dialog}
    </>
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
  dailyLimit: 150,
  minDelaySec: 60,
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

// ─── Domains ─────────────────────────────────────────────────

const CHECK: Record<DomainCheck, { label: string; color: string }> = {
  pass: { label: "Verified", color: "#1F9D4C" },
  warn: { label: "Check", color: "#D97706" },
  fail: { label: "Missing", color: "#E5484D" },
  pending: { label: "Not checked", color: "#A3A3A3" },
};

function Domains({ domains }: { domains: EmailDomainView[] }) {
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const [domain, setDomain] = useState("");

  return (
    <>
      <Card className="mb-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-end">
          <Field label="Add a sending domain" className="flex-1" hint="The part after @ in your mailbox address, e.g. strategiccoresolutions.com">
            <Input value={domain} placeholder="youragency.com" onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && domain.trim() && run("add", addDomainAction(domain), "Domain added and checked").then((r) => r !== null && setDomain(""))} />
          </Field>
          <Button
            size="lg"
            disabled={!domain.trim() || busy === "add"}
            onClick={() => run("add", addDomainAction(domain), "Domain added and checked").then((r) => r !== null && setDomain(""))}
          >
            <Globe className="h-4 w-4" /> {busy === "add" ? "Checking DNS…" : "Add & check"}
          </Button>
        </div>
      </Card>

      {domains.length === 0 ? (
        <Card>
          <EmptyState
            icon={ShieldCheck}
            title="Check your domain's email authentication"
            body="SPF, DKIM and DMARC records tell Gmail and Outlook your emails are genuine. Without them, cold emails land in spam."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {domains.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center gap-4">
                <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-page">
                  <Globe className="h-5 w-5" strokeWidth={1.7} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] font-medium tracking-[-0.01em]">{d.domain}</p>
                  <p className="mt-1 text-[13px] text-neutral-500">
                    {d.details?.provider ? `Sends through ${d.details.provider} · ` : ""}
                    {d.lastCheckedAt ? `Checked ${relativeTime(d.lastCheckedAt)}` : "Not checked yet"}
                  </p>
                </div>
                <Button variant="secondary" size="sm" disabled={busy === d.id} onClick={() => run(d.id, checkDomainAction(d.id), "DNS checked")}>
                  <RefreshCw className={cn("h-3.5 w-3.5", busy === d.id && "animate-spin")} /> Check again
                </Button>
                <IconButton
                  label="Remove domain"
                  size="sm"
                  onClick={() => confirm({ title: `Remove ${d.domain}?`, confirmLabel: "Remove", danger: true, run: () => run("del", deleteDomainAction(d.id), "Domain removed") })}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <DnsCheck
                  name="SPF"
                  status={d.spf}
                  what="Lists the servers allowed to send for your domain."
                  fix={
                    d.spf === "pass"
                      ? d.details?.spfRecord
                      : d.spf === "warn"
                        ? `Your SPF record doesn't include ${d.details?.spfInclude}. Add “include:${d.details?.spfInclude}” before ~all.`
                        : `Add a TXT record on ${d.domain}: v=spf1 include:${d.details?.spfInclude ?? "your-provider"} ~all`
                  }
                />
                <DnsCheck
                  name="DKIM"
                  status={d.dkim}
                  what="Signs each email so it can't be forged."
                  fix={
                    d.dkim === "pass"
                      ? `Found under the “${d.details?.dkimSelector}” selector.`
                      : `Turn on DKIM in your ${d.details?.provider ?? "email provider"}'s settings (Hostinger: hPanel → Emails → your domain → Authentication). We couldn't find a standard selector — if you've already set it up, you can ignore this.`
                  }
                />
                <DnsCheck
                  name="DMARC"
                  status={d.dmarc}
                  what="Tells inboxes what to do with emails that fail SPF/DKIM."
                  fix={d.dmarc === "pass" ? d.details?.dmarcRecord : `Add a TXT record on _dmarc.${d.domain}: v=DMARC1; p=none; rua=mailto:dmarc@${d.domain}`}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
      {dialog}
    </>
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
