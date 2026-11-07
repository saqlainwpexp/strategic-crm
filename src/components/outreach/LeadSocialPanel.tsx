"use client";

// Lead drawer → Social tab: profile links, social fields, and one panel per platform thread
// with an inline stage change and a small activity logger.

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Plus, Save } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { PlatformIcon } from "./PlatformIcon";
import { StageBadge } from "./StageBadge";
import { useQuickLog } from "./SocialCard";
import { openThreadAction, saveLeadSocialAction, setStageAction, updateThreadAction, logActivityAction } from "@/server/outreach/actions";
import {
  ACTIVITY_LABEL,
  ACTIVITY_TYPES,
  OUTREACH_STAGES,
  PLATFORMS,
  PRIMARY_CHANNELS,
  STAGE_LABEL,
  platformLabel,
  type OutreachActivityType,
  type OutreachStage,
} from "@/lib/outreach/platforms";
import type { OThread } from "@/lib/outreach/types";
import type { Lead } from "@/lib/types";
import { formatDateTime } from "@/lib/date";

/** Profile icons for the drawer's action row. */
export function SocialLinks({ leadId }: { leadId: string }) {
  const { data } = useOutreach();
  const profiles = data.profiles.filter((p) => p.leadId === leadId);
  if (!profiles.length) return null;
  return (
    <>
      {profiles.map((p) => (
        <a key={p.id} href={p.url} target="_blank" rel="noreferrer noopener" title={`${platformLabel(p.platform)} profile`} className="grid h-11 w-11 place-items-center rounded-full bg-page hover:bg-neutral-200">
          <PlatformIcon platform={p.platform} size={24} />
        </a>
      ))}
    </>
  );
}

export function LeadSocialPanel({ lead }: { lead: Lead }) {
  const { data, act } = useOutreach();
  const threads = data.threads.filter((t) => t.leadId === lead.id);
  const fields = data.leadFields[lead.id];
  const profiles = data.profiles.filter((p) => p.leadId === lead.id);
  const [addPlatform, setAddPlatform] = useState("");

  const freePlatforms = PLATFORMS.filter((p) => !threads.some((t) => t.platform === p.id));

  return (
    <div className="flex flex-col gap-7">
      <ProfileEditor lead={lead} key={`${lead.id}:${profiles.map((p) => p.url).join("|")}:${JSON.stringify(fields ?? {})}`} />

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[15px] font-medium">Conversations</h3>
          {freePlatforms.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={addPlatform} onChange={(e) => setAddPlatform(e.target.value)} className="w-44">
                <option value="">Start on…</option>
                {freePlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                disabled={!addPlatform}
                onClick={async () => {
                  const r = await act(openThreadAction(lead.id, addPlatform), `${platformLabel(addPlatform)} thread started`);
                  if (r.ok) setAddPlatform("");
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          )}
        </div>
        {threads.length === 0 ? (
          <p className="rounded-2xl bg-soft px-5 py-8 text-center text-[13.5px] text-neutral-500">No social outreach yet. Add a profile above or start a conversation on a platform.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {threads.map((t) => (
              <ThreadPanel key={t.id} thread={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileEditor({ lead }: { lead: Lead }) {
  const { data, act } = useOutreach();
  const fields = data.leadFields[lead.id];
  const initialProfiles = useMemo(
    () => Object.fromEntries(PLATFORMS.map((p) => [p.id, data.profiles.find((x) => x.leadId === lead.id && x.platform === p.id)?.url ?? ""])),
    [data.profiles, lead.id]
  );
  const [profiles, setProfiles] = useState<Record<string, string>>(initialProfiles);
  const [f, setF] = useState({
    jobTitle: fields?.jobTitle ?? "",
    industry: fields?.industry ?? "",
    location: fields?.location ?? "",
    connectionDegree: fields?.connectionDegree ?? "",
    followerCount: fields?.followerCount == null ? "" : String(fields.followerCount),
    primaryChannel: fields?.primaryChannel ?? "",
  });
  const [busy, setBusy] = useState(false);
  const shown = PLATFORMS.filter((p) => ["linkedin", "facebook", "instagram"].includes(p.id) || initialProfiles[p.id]);
  const [showAll, setShowAll] = useState(false);

  const save = async () => {
    setBusy(true);
    await act(
      saveLeadSocialAction(lead.id, {
        profiles: PLATFORMS.filter((p) => profiles[p.id] !== initialProfiles[p.id]).map((p) => ({ platform: p.id, value: profiles[p.id] })),
        jobTitle: f.jobTitle,
        industry: f.industry,
        location: f.location,
        connectionDegree: f.connectionDegree,
        followerCount: f.followerCount === "" ? null : Number(f.followerCount),
        primaryChannel: f.primaryChannel,
      }),
      "Social details saved"
    );
    setBusy(false);
  };

  return (
    <section className="rounded-2xl bg-soft p-5">
      <h3 className="text-[15px] font-medium">Social profiles</h3>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(showAll ? PLATFORMS : shown).map((p) => (
          <Field key={p.id} label={<span className="inline-flex items-center gap-2"><PlatformIcon platform={p.id} size={18} /> {p.label}</span>}>
            <Input value={profiles[p.id]} onChange={(e) => setProfiles((s) => ({ ...s, [p.id]: e.target.value }))} placeholder={p.idKind === "handle" ? "@handle or profile URL" : "Profile URL"} />
          </Field>
        ))}
      </div>
      {!showAll && shown.length < PLATFORMS.length && (
        <button onClick={() => setShowAll(true)} className="mt-3 text-[12.5px] text-neutral-500 underline-offset-4 hover:text-ink hover:underline">
          More networks (Threads, X, TikTok)
        </button>
      )}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Job title">
          <Input value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} />
        </Field>
        <Field label="Industry">
          <Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} />
        </Field>
        <Field label="Location">
          <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        </Field>
        <Field label="Connection degree">
          <Select value={f.connectionDegree} onChange={(e) => setF({ ...f, connectionDegree: e.target.value })}>
            <option value="">—</option>
            <option>1st</option>
            <option>2nd</option>
            <option>3rd</option>
          </Select>
        </Field>
        <Field label="Followers">
          <Input type="number" min={0} value={f.followerCount} onChange={(e) => setF({ ...f, followerCount: e.target.value })} />
        </Field>
        <Field label="Primary channel">
          <Select value={f.primaryChannel} onChange={(e) => setF({ ...f, primaryChannel: e.target.value })}>
            <option value="">—</option>
            {PRIMARY_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {c === "phone" ? "Phone" : c === "email" ? "Email" : platformLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}

function ThreadPanel({ thread }: { thread: OThread }) {
  const { data, act, patchThread } = useOutreach();
  const { userById, perms } = useCrm();
  const quick = useQuickLog();
  const [url, setUrl] = useState(thread.threadUrl);
  const [type, setType] = useState<OutreachActivityType>("dm");
  const [direction, setDirection] = useState<"outbound" | "inbound">("outbound");
  const [text, setText] = useState("");
  useEffect(() => setUrl(thread.threadUrl), [thread.threadUrl]);
  const link = thread.threadUrl || thread.profileUrl;

  const changeStage = async (stage: OutreachStage) => {
    if (stage === "call_booked") return quick(thread, "booked");
    const before = thread.stage;
    patchThread(thread.id, { stage });
    const r = await act(setStageAction({ threadId: thread.id, stage }), `Stage: ${STAGE_LABEL[stage]}`);
    if (!r.ok) patchThread(thread.id, { stage: before });
  };

  const log = async () => {
    const input = { threadId: thread.id, direction, type, messageText: text || undefined };
    let r = await act(logActivityAction(input), "Activity logged");
    if (!r.ok && "code" in r && r.code === "limit" && perms.manageUsers && window.confirm(`${r.error}\n\nLog anyway with admin override?`))
      r = await act(logActivityAction({ ...input, override: true }), "Activity logged");
    if (r.ok) setText("");
  };

  return (
    <div className="rounded-2xl border border-black/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <PlatformIcon platform={thread.platform} size={30} />
        <span className="text-[14.5px] font-medium">{platformLabel(thread.platform)}</span>
        <StageBadge stage={thread.stage} />
        <span className="ml-auto flex items-center gap-2">
          <Select value={thread.stage} onChange={(e) => changeStage(e.target.value as OutreachStage)} className="w-48" aria-label="Change stage">
            {OUTREACH_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </Select>
          {link && (
            <a href={link} target="_blank" rel="noreferrer noopener" className="grid h-11 w-11 place-items-center rounded-full bg-page hover:bg-neutral-200" title="Open thread">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-4">
        {[
          ["Owner", userById(thread.ownerId)?.name ?? "—"],
          ["Last sent", thread.lastOutboundAt ? formatDateTime(thread.lastOutboundAt) : "—"],
          ["Last reply", thread.lastInboundAt ? formatDateTime(thread.lastInboundAt) : "—"],
          ["Next follow-up", thread.nextFollowupAt ? formatDateTime(thread.nextFollowupAt) : "—"],
          ["Follow-ups", `${thread.followupCount}/3`],
          ["Campaign", data.campaigns.find((c) => c.id === thread.campaignId)?.name ?? "—"],
          ["Sentiment", thread.replySentiment ?? "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-neutral-400">{k}</dt>
            <dd className="mt-0.5 truncate text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_200px]">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Conversation link (https://…/messaging/…)" className="h-10 text-[13px]" />
        <Select
          value={thread.campaignId ?? ""}
          onChange={(e) => act(updateThreadAction(thread.id, { campaignId: e.target.value || null }), "Campaign updated")}
          aria-label="Campaign"
        >
          <option value="">No campaign</option>
          {data.campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      {url !== thread.threadUrl && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => act(updateThreadAction(thread.id, { threadUrl: url }), "Link saved")}>
          Save link
        </Button>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
        <select value={direction} onChange={(e) => setDirection(e.target.value as "outbound" | "inbound")} className="h-9 rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px]">
          <option value="outbound">We sent</option>
          <option value="inbound">They sent</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as OutreachActivityType)} className="h-9 rounded-full border border-black/[0.08] bg-white px-3 text-[12.5px]">
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_LABEL[t]}
            </option>
          ))}
        </select>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message text (optional)" className="h-9 min-w-[160px] flex-1 text-[13px]" />
        <Button size="sm" onClick={log}>
          Log
        </Button>
      </div>
      {thread.notes && <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-soft px-3.5 py-2.5 font-sans text-[12.5px] text-neutral-700">{thread.notes}</pre>}
    </div>
  );
}
