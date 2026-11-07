"use client";

import { useState, useTransition } from "react";
import { Inbox, MessageSquare, Send, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/Layout";
import { markConversationRead, setConversationLabel, sendLinkedInReply } from "@/server/linkedin/actions";
import type { LiConversationWithDetails } from "@/server/linkedin/load";
import type { LiAccount, LiConvLabel } from "@prisma/client";

const LABELS: { value: LiConvLabel; label: string; color: string }[] = [
  { value: "INTERESTED", label: "Interested", color: "bg-emerald-100 text-emerald-700" },
  { value: "NOT_NOW", label: "Not now", color: "bg-amber-100 text-amber-700" },
  { value: "NOT_INTERESTED", label: "Not interested", color: "bg-rose-100 text-rose-700" },
  { value: "WRONG_PERSON", label: "Wrong person", color: "bg-neutral-100 text-neutral-600" },
];

export function InboxView({ conversations: initial, accounts }: { conversations: LiConversationWithDetails[]; accounts: LiAccount[] }) {
  const [convs, setConvs] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null);
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterLabel, setFilterLabel] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = convs.filter((c) => {
    if (filterAccount !== "all" && c.accountId !== filterAccount) return false;
    if (filterLabel !== "all" && c.label !== filterLabel) return false;
    if (unreadOnly && !c.unread) return false;
    return true;
  });

  const selectedConv = convs.find((c) => c.id === selected) ?? null;

  const handleSelect = (id: string) => {
    setSelected(id);
    const conv = convs.find((c) => c.id === id);
    if (conv?.unread) {
      startTransition(async () => {
        await markConversationRead(id);
        setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
      });
    }
  };

  const handleLabel = (id: string, label: LiConvLabel | null) => {
    startTransition(async () => {
      await setConversationLabel(id, label);
      setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
    });
  };

  const handleReply = () => {
    if (!selected || !reply.trim()) return;
    const text = reply.trim();
    setReply("");
    startTransition(async () => {
      const msg = await sendLinkedInReply(selected, text);
      setConvs((prev) =>
        prev.map((c) =>
          c.id === selected
            ? { ...c, messages: [...c.messages, { ...msg, direction: "OUT" as const }], lastMessageAt: new Date() }
            : c
        )
      );
    });
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        subtitle="All LinkedIn conversations across every sender account"
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)} className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2 text-[13px] outline-none">
          <option value="all">All accounts</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)} className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-2 text-[13px] outline-none">
          <option value="all">All labels</option>
          {LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <button
          onClick={() => setUnreadOnly((v) => !v)}
          className={cn("rounded-full border px-3.5 py-1.5 text-[13px] transition-colors", unreadOnly ? "border-ink bg-ink text-white" : "border-black/[0.08] bg-white hover:bg-page")}
        >
          Unread only
        </button>
        <span className="text-[13px] text-neutral-400">{filtered.length} conversation{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 320px)", minHeight: 400 }}>
        {/* Conversation list */}
        <div className="w-80 shrink-0 overflow-y-auto rounded-2xl border border-black/[0.06] bg-white">
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-12">
              <Inbox className="h-10 w-10 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-[14px] text-neutral-500">No conversations</p>
            </div>
          ) : (
            filtered.map((c) => {
              const name = c.prospect ? `${c.prospect.firstName} ${c.prospect.lastName}`.trim() || "Unknown" : "Unknown";
              const lastMsg = c.messages.at(-1);
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelect(c.id)}
                  className={cn("flex w-full items-start gap-3 border-b border-neutral-100 px-4 py-3.5 text-left transition-colors last:border-0", selected === c.id ? "bg-page" : "hover:bg-page/60")}
                >
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[13px] font-semibold">
                    {name[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("truncate text-[13.5px]", c.unread ? "font-semibold" : "font-medium")}>{name}</p>
                      {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#0A66C2]" />}
                    </div>
                    <p className="truncate text-[12px] text-neutral-500">{c.prospect?.company}</p>
                    {lastMsg && <p className="truncate text-[12px] text-neutral-400">{lastMsg.direction === "OUT" ? "You: " : ""}{lastMsg.text}</p>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Thread view */}
        <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white">
          {!selectedConv ? (
            <div className="flex h-full flex-col items-center justify-center">
              <MessageSquare className="h-10 w-10 text-neutral-300" strokeWidth={1.5} />
              <p className="mt-3 text-[14px] text-neutral-500">Select a conversation</p>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
                <div>
                  <p className="text-[15px] font-semibold">
                    {selectedConv.prospect ? `${selectedConv.prospect.firstName} ${selectedConv.prospect.lastName}`.trim() : "Unknown"}
                  </p>
                  <p className="text-[12.5px] text-neutral-500">
                    {selectedConv.prospect?.title}{selectedConv.prospect?.company ? ` · ${selectedConv.prospect.company}` : ""}
                    {" · "}{selectedConv.account.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-neutral-400" strokeWidth={1.8} />
                  <select
                    value={selectedConv.label ?? ""}
                    onChange={(e) => handleLabel(selectedConv.id, (e.target.value as LiConvLabel) || null)}
                    className="rounded-xl border border-black/[0.08] bg-page px-3 py-1.5 text-[12.5px] outline-none"
                  >
                    <option value="">No label</option>
                    {LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                  {selectedConv.label && (
                    <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", LABELS.find((l) => l.value === selectedConv.label)?.color)}>
                      {LABELS.find((l) => l.value === selectedConv.label)?.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto space-y-3 px-5 py-4">
                {selectedConv.messages.length === 0 ? (
                  <p className="text-center text-[13px] text-neutral-400">No messages yet</p>
                ) : (
                  selectedConv.messages.map((m) => (
                    <div key={m.id} className={cn("flex", m.direction === "OUT" ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px]", m.direction === "OUT" ? "bg-[#0A66C2] text-white" : "bg-page text-ink")}>
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className={cn("mt-1 text-[11px]", m.direction === "OUT" ? "text-blue-200" : "text-neutral-400")}>
                          {new Date(m.sentAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {selectedConv.stoppedByReply && (
                  <p className="text-center text-[12px] text-neutral-400">— Campaign sequence stopped (lead replied) —</p>
                )}
              </div>

              {/* Reply box */}
              <div className="border-t border-neutral-100 px-4 py-3">
                <div className="flex items-end gap-3">
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleReply(); }}
                    placeholder="Type a reply… (⌘↵ to send)"
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-black/[0.08] bg-page px-4 py-2.5 text-[14px] outline-none focus:border-[#0A66C2]"
                  />
                  <button
                    onClick={handleReply}
                    disabled={!reply.trim() || pending}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A66C2] text-white disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] text-amber-600">Dry-run mode: replies are logged but not sent to LinkedIn until the worker is wired.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
