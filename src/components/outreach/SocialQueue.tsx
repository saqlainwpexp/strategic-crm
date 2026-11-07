"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, Plus } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { PlatformIcon } from "./PlatformIcon";
import { SocialCard } from "./SocialCard";
import { AddSocialLeadModal } from "./AddSocialLeadModal";
import { BookmarkletCard } from "./SocialAdmin";
import { Modal } from "@/components/ui/Overlay";
import { useSendCounts, type SendCount } from "./useSendCounts";
import { buildSocialQueue, type SocialKind } from "@/lib/outreach/queue";
import { PLATFORMS, platformLabel } from "@/lib/outreach/platforms";
import { cn } from "@/lib/utils";

type Filter = "all" | SocialKind;
const PAGE = 15;

export function SocialQueue({ focusLeadId }: { focusLeadId?: string | null }) {
  const { viewer } = useCrm();
  const { data } = useOutreach();
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("all");
  const [platform, setPlatform] = useState<string>("");
  const [limit, setLimit] = useState(PAGE);
  const [adding, setAdding] = useState(false);
  const [bookmarklet, setBookmarklet] = useState(false);
  const counts = useSendCounts(data, viewer.id);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Reps work their own threads; managers see the team's (the server already scopes data).
  const ownsThreads = data.threads.some((t) => t.ownerId === viewer.id);
  const ownerId = viewer.role === "SALES" || ownsThreads ? viewer.id : undefined;
  const [teamView, setTeamView] = useState(false);

  const queue = useMemo(
    () => buildSocialQueue(data.threads, data.activities, data.campaigns, { ownerId: teamView ? undefined : ownerId, platform: platform || undefined, now }),
    [data, ownerId, teamView, platform, now]
  );
  const by = (k: SocialKind) => queue.filter((q) => q.kind === k).length;
  let visible = filter === "all" ? queue : queue.filter((q) => q.kind === filter);
  if (focusLeadId) {
    // Opened from the bookmarklet / lead drawer: show that lead's threads on top.
    const focus = data.threads.filter((t) => t.leadId === focusLeadId);
    const focusIds = new Set(focus.map((t) => t.id));
    visible = [
      ...focus.map((t) => visible.find((v) => v.thread.id === t.id) ?? { thread: t, kind: "new" as const, lastActivity: null, lastTouch: t.lastInboundAt ?? t.lastOutboundAt }),
      ...visible.filter((v) => !focusIds.has(v.thread.id)),
    ];
  }
  const platformsInUse = PLATFORMS.filter((p) => data.threads.some((t) => t.platform === p.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {counts.map((c) => (
          <SendCounter key={c.platform} c={c} />
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">Social queue</h2>
            <p className="mt-1.5 text-[13px] text-neutral-500">Replies waiting on you first, then overdue follow-ups, due today, and new campaign leads.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ownerId && viewer.role !== "SALES" && (
              <Button variant={teamView ? "primary" : "ghost"} size="sm" onClick={() => setTeamView((v) => !v)}>
                {teamView ? "Showing team" : "Show team"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setBookmarklet(true)}>
              Bookmarklet
            </Button>
            <Button variant="brand" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" /> Add social lead
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setLimit(PAGE);
            }}
            options={[
              { value: "all", label: "All", count: queue.length },
              { value: "reply", label: "Replies", count: by("reply") },
              { value: "overdue", label: "Overdue", count: by("overdue") },
              { value: "today", label: "Due today", count: by("today") },
              { value: "new", label: "New", count: by("new") },
            ]}
          />
          {platformsInUse.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button onClick={() => setPlatform("")} className={cn("h-8 rounded-full px-3 text-[12.5px]", !platform ? "bg-ink text-white" : "bg-page text-neutral-600")}>
                All networks
              </button>
              {platformsInUse.map((p) => (
                <button key={p.id} onClick={() => setPlatform(p.id === platform ? "" : p.id)} title={p.label} className={cn("rounded-full p-0.5", platform === p.id ? "ring-2 ring-ink" : "opacity-70 hover:opacity-100")}>
                  <PlatformIcon platform={p.id} size={26} />
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-4 text-[15px] font-medium">Nothing waiting</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-neutral-500">
            {data.threads.length === 0
              ? "Add a social lead, import a Sales Navigator / Phantombuster / Apify CSV from Leads, or use the quick-add bookmarklet (Admin → Social)."
              : "No replies, no follow-ups due, and no new campaign leads. New items appear here as follow-ups come due."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.slice(0, limit).map((item) => (
            <SocialCard key={item.thread.id} item={item} showOwner={!ownerId || teamView} />
          ))}
          {visible.length > limit && (
            <Button variant="secondary" className="self-center" onClick={() => setLimit((l) => l + PAGE)}>
              Show more ({visible.length - limit} left)
            </Button>
          )}
        </div>
      )}
      <AddSocialLeadModal open={adding} onClose={() => setAdding(false)} />
      <Modal open={bookmarklet} onClose={() => setBookmarklet(false)} title="Quick-add from any profile">
        <BookmarkletCard />
      </Modal>
    </div>
  );
}

function SendCounter({ c }: { c: SendCount }) {
  const rows = [
    ...(c.connectionLimit > 0 ? [{ label: "Connections", n: c.connections, max: c.connectionLimit, status: c.connectionStatus }] : []),
    { label: "DMs", n: c.dms, max: c.dmLimit, status: c.dmStatus },
  ];
  return (
    <div className="rounded-[20px] bg-white p-5">
      <div className="flex items-center gap-2.5">
        <PlatformIcon platform={c.platform} size={28} />
        <span className="text-[14px] font-medium">{platformLabel(c.platform)} today</span>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-[12.5px]">
              <span className="text-neutral-500">{r.label}</span>
              <span className={cn("tabular-nums", r.status === "block" ? "text-rose-600" : r.status === "warn" ? "text-amber-600" : "text-ink")}>
                {r.n}
                {r.max > 0 && <span className="text-neutral-400"> / {r.max}</span>}
              </span>
            </div>
            {r.max > 0 && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-page">
                <div
                  className={cn("h-full rounded-full", r.status === "block" ? "bg-rose-500" : r.status === "warn" ? "bg-amber-500" : "bg-brand")}
                  style={{ width: `${Math.min(100, (r.n / r.max) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
