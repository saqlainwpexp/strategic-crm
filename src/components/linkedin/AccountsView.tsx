"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Hourglass,
  LogIn,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { upsertAccount, deleteAccount, setAccountStatus } from "@/server/linkedin/actions";
import type { LiAccount, LiAccountStatus } from "@prisma/client";

const STATUS_LABEL: Record<LiAccountStatus, string> = { WARMING: "Warming", ACTIVE: "Active", PAUSED: "Paused", RESTRICTED: "Restricted" };
const STATUS_COLOR: Record<LiAccountStatus, string> = {
  WARMING: "bg-amber-100 text-amber-700",
  ACTIVE: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-neutral-100 text-neutral-600",
  RESTRICTED: "bg-rose-100 text-rose-700",
};

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Karachi", "Asia/Kolkata", "Australia/Sydney"];

const BLANK = {
  name: "", ownerName: "", linkedinEmail: "", proxyServer: "", proxyUser: "", proxyPassEnc: "",
  profilePath: "", timezone: "America/New_York", locale: "en-US", status: "WARMING" as LiAccountStatus,
  maxDailyConnects: 10, maxDailyMessages: 20, maxDailyViews: 30, warmupWeeks: 0, notes: "",
};

export function AccountsView({ accounts: initial }: { accounts: LiAccount[] }) {
  const [accounts, setAccounts] = useState(initial);
  const [editing, setEditing] = useState<LiAccount | null | "new">(null);
  const [pending, startTransition] = useTransition();

  const openNew = () => setEditing("new");
  const openEdit = (a: LiAccount) => setEditing(a);
  const closeModal = () => setEditing(null);

  const handleSave = (form: typeof BLANK & { id?: string }) => {
    startTransition(async () => {
      await upsertAccount(form);
      window.location.reload();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this account? All its actions and conversations will be removed.")) return;
    startTransition(async () => {
      await deleteAccount(id);
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    });
  };

  const handleStatus = (id: string, status: LiAccountStatus) => {
    startTransition(async () => {
      await setAccountStatus(id, status);
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    });
  };

  return (
    <div>
      <PageHeader
        title="LinkedIn Accounts"
        subtitle="Each account runs through its own proxy and browser profile"
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Add account
          </Button>
        }
      />

      {accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 py-20 text-center">
          <Users className="mx-auto h-10 w-10 text-neutral-300" strokeWidth={1.5} />
          <p className="mt-4 text-[15px] text-neutral-500">No LinkedIn accounts yet</p>
          <p className="mt-1 text-[13px] text-neutral-400">Each account needs its own proxy, browser profile, and warm-up period</p>
          <Button className="mt-6" onClick={openNew}><Plus className="h-4 w-4" />Add account</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((acc) => (
            <AccountCard key={acc.id} account={acc} onEdit={openEdit} onDelete={handleDelete} onStatus={handleStatus} />
          ))}
        </div>
      )}

      {editing !== null && (
        <AccountModal
          account={editing === "new" ? null : editing}
          onClose={closeModal}
          onSave={handleSave}
          saving={pending}
        />
      )}
    </div>
  );
}

function AccountCard({
  account: a,
  onEdit,
  onDelete,
  onStatus,
}: {
  account: LiAccount;
  onEdit: (a: LiAccount) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: LiAccountStatus) => void;
}) {
  const canActivate = a.status === "PAUSED" || a.status === "WARMING";
  const canPause = a.status === "ACTIVE" || a.status === "WARMING";

  return (
    <div className={cn("rounded-2xl border bg-white p-5", a.status === "RESTRICTED" ? "border-rose-200" : "border-black/[0.06]")}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold">{a.name}</p>
          <p className="truncate text-[12.5px] text-neutral-500">{a.ownerName || a.linkedinEmail}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", STATUS_COLOR[a.status])}>
          {STATUS_LABEL[a.status]}
        </span>
      </div>

      {a.status === "RESTRICTED" && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" strokeWidth={1.8} />
          <p className="text-[12px] text-rose-700">{a.lastError || "Account restricted — check LinkedIn"}</p>
        </div>
      )}

      <LinkedInSession account={a} />

      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Connects today" value={`${a.connectsToday}/${a.maxDailyConnects}`} />
        <Metric label="Messages today" value={`${a.messagesToday}/${a.maxDailyMessages}`} />
        <Metric label="Views today" value={`${a.viewsToday}/${a.maxDailyViews}`} />
      </div>

      <div className="mb-3 space-y-1 text-[12px] text-neutral-500">
        <p><span className="text-neutral-400">Timezone:</span> {a.timezone}</p>
        <p><span className="text-neutral-400">Profile:</span> {a.profilePath || <span className="italic text-neutral-300">not set</span>}</p>
        <p><span className="text-neutral-400">Proxy:</span> {a.proxyServer || <span className="italic text-neutral-300">not set</span>}</p>
      </div>

      <div className="flex items-center gap-2 border-t border-neutral-100 pt-3">
        {canPause && (
          <button onClick={() => onStatus(a.id, "PAUSED")} className="flex h-8 items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px] text-neutral-600 hover:bg-neutral-50">
            <Pause className="h-3.5 w-3.5" strokeWidth={1.8} />Pause
          </button>
        )}
        {canActivate && (
          <button onClick={() => onStatus(a.id, "ACTIVE")} className="flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[12.5px] text-emerald-700 hover:bg-emerald-100">
            <Play className="h-3.5 w-3.5" strokeWidth={1.8} />Activate
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onEdit(a)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-page" title="Edit">
            <Edit2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <button onClick={() => onDelete(a.id)} className="grid h-8 w-8 place-items-center rounded-full text-rose-400 hover:bg-rose-50" title="Delete">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-page px-2 py-2">
      <p className="text-[18px] font-semibold leading-none tracking-tight">{value}</p>
      <p className="mt-1 text-[10.5px] text-neutral-500 leading-tight">{label}</p>
    </div>
  );
}

function AccountModal({
  account,
  onClose,
  onSave,
  saving,
}: {
  account: LiAccount | null;
  onClose: () => void;
  onSave: (data: typeof BLANK & { id?: string }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(account ? { ...BLANK, ...account, notes: account.notes ?? "" } : BLANK);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-5 text-[18px] font-semibold">{account ? "Edit account" : "Add LinkedIn account"}</h2>
        <div className="max-h-[65vh] overflow-y-auto space-y-4 pr-1">
          <Field label="Account name *"><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Saqlain – LinkedIn 1" /></Field>
          <Field label="Profile owner"><input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Real person's name" /></Field>
          <Field label="LinkedIn email"><input value={form.linkedinEmail} onChange={(e) => set("linkedinEmail", e.target.value)} placeholder="email@example.com" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Proxy server"><input value={form.proxyServer} onChange={(e) => set("proxyServer", e.target.value)} placeholder="host:port" /></Field>
            <Field label="Proxy user"><input value={form.proxyUser} onChange={(e) => set("proxyUser", e.target.value)} /></Field>
          </div>
          <Field label="Proxy password (stored encrypted)"><input type="password" value={form.proxyPassEnc} onChange={(e) => set("proxyPassEnc", e.target.value)} /></Field>
          <Field label="Browser profile path"><input value={form.profilePath} onChange={(e) => set("profilePath", e.target.value)} placeholder="/data/profiles/account-1" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Timezone">
              <select value={form.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TIMEZONES.map((tz) => <option key={tz}>{tz}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set("status", e.target.value as LiAccountStatus)}>
                {(["WARMING", "ACTIVE", "PAUSED"] as LiAccountStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Max connects/day"><input type="number" min={1} max={25} value={form.maxDailyConnects} onChange={(e) => set("maxDailyConnects", Number(e.target.value))} /></Field>
            <Field label="Max messages/day"><input type="number" min={1} max={100} value={form.maxDailyMessages} onChange={(e) => set("maxDailyMessages", Number(e.target.value))} /></Field>
            <Field label="Max views/day"><input type="number" min={1} max={100} value={form.maxDailyViews} onChange={(e) => set("maxDailyViews", Number(e.target.value))} /></Field>
          </div>
          <Field label="Notes"><textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Any notes about this account…" /></Field>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave({ ...(account ? { id: account.id } : {}), ...form, notes: form.notes ?? "" })} disabled={!form.name || saving}>
            {saving ? "Saving…" : "Save account"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-neutral-700">{label}</span>
      <div className="[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-black/[0.08] [&_input]:bg-page [&_input]:px-3.5 [&_input]:py-2.5 [&_input]:text-[14px] [&_input]:outline-none [&_input]:focus:border-ink [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-black/[0.08] [&_select]:bg-page [&_select]:px-3.5 [&_select]:py-2.5 [&_select]:text-[14px] [&_select]:outline-none [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-black/[0.08] [&_textarea]:bg-page [&_textarea]:px-3.5 [&_textarea]:py-2.5 [&_textarea]:text-[14px] [&_textarea]:outline-none [&_textarea]:focus:border-ink">
        {children}
      </div>
    </label>
  );
}

/**
 * Shows whether a LinkedIn session is saved. "Log in" opens LinkedIn in a new tab; the
 * Strategic CRM extension (extension/linkedin-connect) sends the session here once you sign in.
 */
function LinkedInSession({ account: a }: { account: LiAccount }) {
  const router = useRouter();
  const [waitingSince, setWaitingSince] = useState<number | null>(null);
  const syncedAt = a.sessionSyncedAt ? new Date(a.sessionSyncedAt).getTime() : 0;
  const waiting = waitingSince !== null && syncedAt < waitingSince;
  const connected = !!syncedAt || !!a.profilePath;

  // While you sign in on the other tab, refresh until the extension's sync lands.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 3000);
    const stop = setTimeout(() => setWaitingSince(null), 10 * 60_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [waiting, router]);

  const login = () => {
    setWaitingSince(Date.now());
    window.open("https://www.linkedin.com/login", "_blank", "noopener");
  };

  return (
    <div className="mb-4 rounded-xl border border-black/[0.06] bg-page px-3 py-3">
      <div className="flex items-center gap-3">
        {connected && !waiting ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.8} />
        ) : (
          <LogIn className="h-4 w-4 shrink-0 text-[#0A66C2]" strokeWidth={1.8} />
        )}
        <p className="min-w-0 flex-1 text-[12.5px] text-neutral-600">
          {waiting
            ? "Sign in on the LinkedIn tab…"
            : connected
              ? `LinkedIn connected${syncedAt ? ` · synced ${new Date(syncedAt).toLocaleDateString()}` : ""}`
              : "LinkedIn not connected"}
        </p>
        <button onClick={login} className="h-8 shrink-0 rounded-full bg-[#0A66C2] px-3.5 text-[12.5px] font-medium text-white hover:bg-[#004182]">
          {waiting ? "Open again" : connected ? "Reconnect" : "Log in to LinkedIn"}
        </button>
      </div>
      {waiting && (
        <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
          Needs the Strategic CRM extension in this browser. Already signed in to LinkedIn? Click the extension icon → Sync now.
        </p>
      )}
      {!connected && !waiting && a.status !== "RESTRICTED" && a.lastError && <p className="mt-2 text-[12px] text-rose-600">{a.lastError}</p>}
    </div>
  );
}
