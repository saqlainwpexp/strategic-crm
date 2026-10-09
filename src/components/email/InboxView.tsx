"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, ExternalLink, Inbox, Mail, MailOpen, RefreshCw, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { FilterSelect, SearchInput, Textarea } from "@/components/ui/Form";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { dayKey, dayLabel, formatDateTime, formatTime, todayKey } from "@/lib/date";
import type { EmailAccountView, ThreadMessage, ThreadSummary } from "@/lib/email-types";
import { getThreadAction, replyThreadAction, syncInboxNowAction, updateThreadAction } from "@/server/email/actions";
import { useEmailAction } from "./kit";

type Folder = "inbox" | "unread" | "archived";

const when = (iso: string) => (dayKey(iso) === todayKey() ? formatTime(iso) : dayLabel(dayKey(iso)));

export function InboxView({ threads, accounts }: { threads: ThreadSummary[]; accounts: EmailAccountView[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run, busy } = useEmailAction();
  const [q, setQ] = useState(params.get("q") ?? "");
  const folder = (params.get("folder") as Folder) || "inbox";
  const openId = params.get("thread");
  const open = threads.find((t) => t.id === openId) ?? null;

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
      router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
    },
    [params, pathname, router]
  );

  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => setParams({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // New replies arrive in the background — refresh the list every minute.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  const imapOn = accounts.some((a) => a.imapEnabled);

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle="Replies to your campaigns and automations, from every connected mailbox."
        actions={
          <Button
            variant="secondary"
            size="lg"
            disabled={busy === "sync" || !imapOn}
            onClick={() =>
              run("sync", syncInboxNowAction(), (r) =>
                r.errors.length ? `Some mailboxes couldn't sync: ${r.errors[0]}` : r.added ? `${r.added} new message${r.added === 1 ? "" : "s"}` : "You're up to date"
              )
            }
          >
            <RefreshCw className={cn("h-4 w-4", busy === "sync" && "animate-spin")} /> {busy === "sync" ? "Checking…" : "Check for replies"}
          </Button>
        }
      />

      <Card className="grid min-h-[640px] grid-cols-1 overflow-hidden p-0 lg:grid-cols-[400px_minmax(0,1fr)]">
        {/* Thread list */}
        <div className={cn("flex min-w-0 flex-col border-neutral-100 lg:border-r", open && "hidden lg:flex")}>
          <div className="flex flex-col gap-3 border-b border-neutral-100 p-5">
            <Segmented
              size="sm"
              value={folder}
              onChange={(v) => setParams({ folder: v === "inbox" ? null : v, thread: null })}
              options={[
                { value: "inbox", label: "Inbox" },
                { value: "unread", label: "Unread" },
                { value: "archived", label: "Archived" },
              ]}
            />
            <div className="flex gap-2">
              <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-10 min-w-0 flex-1" />
              {accounts.length > 1 && (
                <FilterSelect value={params.get("account") ?? ""} onChange={(e) => setParams({ account: e.target.value || null })} active={!!params.get("account")} className="w-[150px]">
                  <option value="">All mailboxes</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </FilterSelect>
              )}
            </div>
          </div>
          {threads.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={folder === "archived" ? "Nothing archived" : "No replies yet"}
              body={!accounts.length ? "Connect a mailbox under Sending and its replies appear here." : !imapOn ? "Turn on reply syncing for a mailbox under Sending." : "When contacts reply, their messages show up here within a couple of minutes."}
              className="flex-1"
            />
          ) : (
            <ul className="scroll-slim flex-1 overflow-y-auto lg:max-h-[720px]">
              {threads.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setParams({ thread: t.id })}
                    className={cn(
                      "flex w-full gap-3.5 border-b border-neutral-100 px-5 py-4 text-left transition-colors",
                      t.id === openId ? "bg-page" : "hover:bg-neutral-50"
                    )}
                  >
                    <span className="relative mt-0.5">
                      <Avatar name={t.contactName || t.contactEmail} size={38} />
                      {t.unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-brand ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={cn("truncate text-[14px]", t.unread ? "font-semibold" : "font-medium")}>{t.businessName ?? (t.contactName || t.contactEmail)}</span>
                        <span className="shrink-0 text-[11.5px] text-neutral-500">{when(t.lastMessageAt)}</span>
                      </span>
                      <span className={cn("mt-0.5 block truncate text-[13px]", t.unread ? "text-ink" : "text-neutral-600")}>{t.subject}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{t.snippet}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Conversation */}
        <div className={cn("min-w-0", !open && "hidden lg:block")}>
          {open ? (
            <Conversation key={open.id} thread={open} onBack={() => setParams({ thread: null })} />
          ) : (
            <EmptyState icon={Mail} title="Pick a conversation" body="Select a reply on the left to read it and answer." className="h-full" />
          )}
        </div>
      </Card>
    </div>
  );
}

function Conversation({ thread, onBack }: { thread: ThreadSummary; onBack: () => void }) {
  const { run, busy } = useEmailAction();
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    const r = await getThreadAction(thread.id);
    if (r.ok) setMessages(r.data);
  }, [thread.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-[640px] flex-col">
      <div className="flex flex-wrap items-start gap-4 border-b border-neutral-100 px-7 py-5">
        <IconButton label="Back" size="sm" className="lg:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[18px] font-medium tracking-[-0.01em]">{thread.subject}</p>
          <p className="mt-1 truncate text-[13px] text-neutral-500">
            {thread.contactName ? `${thread.contactName} · ` : ""}
            {thread.contactEmail} → {thread.accountEmail}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {thread.leadId && (
            <Link href={`/email/contacts?contact=${thread.leadId}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-page px-4 text-[13px] hover:bg-neutral-200/80">
              <ExternalLink className="h-3.5 w-3.5" /> {thread.businessName ?? "Contact"}
            </Link>
          )}
          <IconButton label="Mark as unread" size="sm" onClick={() => run("unread", updateThreadAction(thread.id, { unread: true }), "Marked as unread")}>
            <MailOpen className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={thread.archived ? "Move to inbox" : "Archive"}
            size="sm"
            onClick={() => run("arch", updateThreadAction(thread.id, { archived: !thread.archived }), thread.archived ? "Moved to inbox" : "Archived").then(onBack)}
          >
            {thread.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto bg-soft/60 px-7 py-6 lg:max-h-[560px]">
        {!messages ? (
          <p className="text-[13px] text-neutral-500">Loading…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("max-w-[85%] rounded-[20px] px-5 py-4", m.direction === "OUT" ? "self-end bg-ink text-white" : "self-start bg-white")}>
                <p className={cn("text-[12px]", m.direction === "OUT" ? "text-white/60" : "text-neutral-500")}>
                  {m.direction === "OUT" ? "You" : m.fromName || m.fromEmail} · {formatDateTime(m.sentAt)}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed">{trimQuoted(m.text)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-neutral-100 p-5">
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${thread.contactName || thread.contactEmail}…`} className="min-h-[96px]" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12px] text-neutral-500">Sends from {thread.accountEmail} with your signature, in the same email thread.</p>
          <Button
            disabled={!reply.trim() || busy === "reply"}
            onClick={async () => {
              const ok = await run("reply", replyThreadAction(thread.id, reply), "Reply sent");
              if (ok !== null) {
                setReply("");
                void load();
              }
            }}
          >
            <Send className="h-4 w-4" /> {busy === "reply" ? "Sending…" : "Send reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Hide the quoted history most mail apps append below a reply ("On Tue, … wrote:"). */
function trimQuoted(text: string) {
  const cut = text.search(/\n\s*(On .{5,200} wrote:|-{2,}\s*Original Message\s*-{2,}|From: .+\nSent: )/i);
  const body = cut > 40 ? text.slice(0, cut) : text;
  return body.replace(/\n>.*$/gm, "").trim();
}
