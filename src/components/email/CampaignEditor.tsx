"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarClock, Check, LayoutTemplate, Send } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils";
import { dayKey, formatDateTime, shiftDayKey, todayKey, tzAbbrev, zonedISO } from "@/lib/date";
import { EMPTY_AUDIENCE, isValidEmail, type AudienceFilter } from "@/lib/email";
import type { AudienceOptions, CampaignView, EmailAccountView, TemplateView } from "@/lib/email-types";
import { launchCampaignAction, saveCampaignAction, setCampaignStatusAction } from "@/server/email/actions";
import { AudienceBuilder } from "./AudienceBuilder";
import { EmailEditor } from "./EmailEditor";
import { EmailPreview } from "./EmailPreview";
import { SendTestButton } from "./SendTestButton";
import { useEmailAction } from "./kit";
import { ALL_INBOXES, SenderPicker, senderCapacity } from "./SenderPicker";

type Form = {
  name: string;
  subject: string;
  previewText: string;
  html: string;
  fromName: string;
  replyTo: string;
  accountIds: string[];
  audience: AudienceFilter;
  trackOpens: boolean;
  trackClicks: boolean;
  addUnsubscribe: boolean;
};

export const HANDOFF_KEY = "scrm.campaign.leadIds";

export function CampaignEditor({
  campaign,
  accounts,
  templates,
  options,
}: {
  campaign: CampaignView | null;
  accounts: EmailAccountView[];
  templates: TemplateView[];
  options: AudienceOptions;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, busy } = useEmailAction();
  const usable = accounts.filter((a) => a.status !== "DISCONNECTED");

  const [f, setF] = useState<Form>(() => {
    if (campaign) {
      const { name, subject, previewText, html, fromName, replyTo, accountIds, audience, trackOpens, trackClicks, addUnsubscribe } = campaign;
      return { name, subject, previewText, html, fromName, replyTo, accountIds, audience, trackOpens, trackClicks, addUnsubscribe };
    }
    const t = templates.find((x) => x.id === params.get("template"));
    return {
      name: t ? t.name : "Untitled campaign",
      subject: t?.subject ?? "",
      previewText: "",
      html: t?.html ?? "",
      fromName: "",
      replyTo: "",
      accountIds: [ALL_INBOXES],
      audience: EMPTY_AUDIENCE,
      trackOpens: true,
      trackClicks: true,
      addUnsubscribe: true,
    };
  });
  const [dirty, setDirty] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [launch, setLaunch] = useState<null | "now" | "schedule">(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  // Contacts page → "Email selected" hands the ids over through sessionStorage.
  useEffect(() => {
    if (campaign || params.get("from") !== "contacts") return;
    try {
      const ids = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) ?? "[]");
      if (Array.isArray(ids) && ids.length) setF((p) => ({ ...p, audience: { ...EMPTY_AUDIENCE, leadIds: ids.filter((x) => typeof x === "string") } }));
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch {
      /* ignore */
    }
  }, [campaign, params]);

  const checks = useMemo(
    () => [
      { ok: senderCapacity(accounts, f.accountIds).inboxes > 0, label: "Sending inboxes chosen" },
      { ok: (count ?? 0) > 0, label: count === null ? "Audience" : `${count.toLocaleString("en-US")} recipient${count === 1 ? "" : "s"}` },
      { ok: f.subject.trim().length > 0, label: "Subject line" },
      { ok: f.html.replace(/<[^>]+>/g, "").trim().length > 1, label: "Email body" },
      { ok: !f.replyTo || isValidEmail(f.replyTo), label: "Reply-to address is valid" },
    ],
    [f, count]
  );
  const ready = checks.every((c) => c.ok);
  const cap = senderCapacity(accounts, f.accountIds);

  async function save(): Promise<string | null> {
    const res = await run("save", saveCampaignAction({ id: campaign?.id, ...f }));
    if (!res) return null;
    setDirty(false);
    if (!campaign) router.replace(`/email/campaigns/${res.id}`);
    return res.id;
  }

  const scheduled = campaign?.status === "SCHEDULED";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 pb-10 pt-6">
        <div className="min-w-0 flex-1">
          <Link href="/email/campaigns" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-neutral-500 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Campaigns
          </Link>
          <input
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            aria-label="Campaign name"
            className="w-full bg-transparent text-[34px] font-normal leading-[1.1] tracking-[-0.025em] outline-none placeholder:text-neutral-300 md:text-[40px]"
            placeholder="Campaign name"
          />
          <p className="mt-3 text-[15px] text-neutral-500">
            {scheduled && campaign?.scheduledAt ? `Scheduled for ${formatDateTime(campaign.scheduledAt)} ${tzAbbrev(new Date(campaign.scheduledAt))}` : "Draft"}
            {dirty && " · unsaved changes"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SendTestButton accounts={usable} subject={f.subject} html={f.html} previewText={f.previewText} defaultAccountId={f.accountIds[0]} />
          <Button variant="secondary" size="lg" onClick={save} disabled={busy === "save" || !f.name.trim()}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* 1. Sender */}
          <Card className="p-8">
            <CardHeader title="1. Sender" subtitle="Emails rotate across your inboxes, each respecting its own daily limit and pace." />
            <SenderPicker accounts={accounts} value={f.accountIds} onChange={(v) => set("accountIds", v)} />
            {count !== null && count > 0 && cap.perDay > 0 && (
              <p className="mt-3 text-[12.5px] text-neutral-500">
                At full capacity, {count.toLocaleString("en-US")} emails take about {Math.max(1, Math.ceil(count / cap.perDay))} day{Math.ceil(count / cap.perDay) > 1 ? "s" : ""} to go out.
              </p>
            )}
            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="From name" hint="Leave blank to use each mailbox's own name.">
                <Input value={f.fromName} placeholder="Alex from Strategic" onChange={(e) => set("fromName", e.target.value)} />
              </Field>
              <Field label="Reply-to" hint="Optional — replies go to the sending mailbox by default.">
                <Input type="email" value={f.replyTo} placeholder="sales@youragency.com" onChange={(e) => set("replyTo", e.target.value)} />
              </Field>
            </div>
          </Card>

          {/* 2. Audience */}
          <Card className="p-8">
            <CardHeader title="2. Audience" subtitle="Your CRM leads are your contacts — no separate list to maintain." />
            <AudienceBuilder value={f.audience} onChange={(v) => set("audience", v)} options={options} onCount={setCount} />
          </Card>

          {/* 3. Content */}
          <Card className="p-8">
            <CardHeader
              title="3. Email"
              subtitle="Personal, plain emails get the most replies. Use Personalise to add the contact's name or business."
              actions={
                templates.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-neutral-500" />
                    <Select
                      value=""
                      onChange={(e) => {
                        const t = templates.find((x) => x.id === e.target.value);
                        if (t) {
                          setF((p) => ({ ...p, subject: t.subject || p.subject, html: t.html }));
                          setDirty(true);
                        }
                      }}
                      className="w-[220px]"
                    >
                      <option value="">Load a template…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : undefined
              }
            />
            <div className="grid grid-cols-1 gap-5">
              <Field label="Subject line" required hint={f.subject.length > 60 ? `${f.subject.length} characters — shorter subjects get opened more.` : undefined}>
                <Input value={f.subject} placeholder="Quick idea for {{business_name}}" onChange={(e) => set("subject", e.target.value)} />
              </Field>
              <Field label="Preview text" hint="The grey line inboxes show after the subject.">
                <Input value={f.previewText} placeholder="Three quick fixes for your homepage" onChange={(e) => set("previewText", e.target.value)} />
              </Field>
            </div>
            <Segmented
              size="sm"
              className="mb-4 mt-7"
              value={view}
              onChange={setView}
              options={[
                { value: "edit", label: "Write" },
                { value: "preview", label: "Preview" },
              ]}
            />
            {view === "edit" ? (
              <EmailEditor value={f.html} onChange={(html) => set("html", html)} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-black/[0.08]">
                <EmailPreview html={f.html} height={480} />
              </div>
            )}
          </Card>

          {/* 4. Settings */}
          <Card className="p-8">
            <CardHeader title="4. Tracking & compliance" />
            <div className="flex flex-col gap-5">
              <Toggle checked={f.trackOpens} onChange={(v) => set("trackOpens", v)} label="Track opens (adds an invisible image)" />
              <Toggle checked={f.trackClicks} onChange={(v) => set("trackClicks", v)} label="Track link clicks" />
              <Toggle checked={f.addUnsubscribe} onChange={(v) => set("addUnsubscribe", v)} label="Add an unsubscribe link at the bottom" />
              <p className="text-[12.5px] leading-relaxed text-neutral-500">
                For cold outreach, turning tracking off can improve inbox placement. Keep the unsubscribe link on — it's required by anti-spam laws and Gmail's sender rules.
              </p>
            </div>
          </Card>
        </div>

        {/* Summary rail */}
        <div>
          <Card className="sticky top-[112px] p-7">
            <p className="text-[16px] font-medium tracking-[-0.01em]">Ready to send?</p>
            <ul className="mt-5 flex flex-col gap-3">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-3 text-[13.5px]">
                  <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", c.ok ? "bg-[#E9F8EE] text-[#1F9D4C]" : "bg-page text-neutral-400")}>
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className={c.ok ? "text-ink" : "text-neutral-500"}>{c.label}</span>
                </li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-2.5">
              <Button size="lg" disabled={!ready} onClick={() => setLaunch("now")}>
                <Send className="h-4 w-4" /> Send now
              </Button>
              <Button variant="secondary" size="lg" disabled={!ready} onClick={() => setLaunch("schedule")}>
                <CalendarClock className="h-4 w-4" /> {scheduled ? "Reschedule" : "Schedule"}
              </Button>
              {scheduled && campaign && (
                <Button variant="link" size="sm" className="mt-1 self-center" onClick={() => run("unsched", setCampaignStatusAction(campaign.id, "unschedule"), "Moved back to drafts")}>
                  Cancel schedule
                </Button>
              )}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed text-neutral-500">
              Emails go out gradually — each mailbox respects its daily limit and the gap between emails — so a big list can take a while.
            </p>
          </Card>
        </div>
      </div>

      <LaunchModal
        mode={launch}
        count={count}
        onClose={() => setLaunch(null)}
        onConfirm={async (when) => {
          const id = await save();
          if (!id) return;
          const res = await run(
            "launch",
            launchCampaignAction(id, when),
            (r) => (r.recipients === null ? "Campaign scheduled" : `Sending to ${r.recipients.toLocaleString("en-US")} contacts`)
          );
          if (res) {
            setLaunch(null);
            router.push(`/email/campaigns/${id}`);
          }
        }}
        busy={busy === "launch" || busy === "save"}
      />
    </div>
  );
}

function LaunchModal({
  mode,
  count,
  onClose,
  onConfirm,
  busy,
}: {
  mode: null | "now" | "schedule";
  count: number | null;
  onClose: () => void;
  onConfirm: (whenISO: string | null) => void;
  busy: boolean;
}) {
  const [day, setDay] = useState(shiftDayKey(todayKey(), 1));
  const [time, setTime] = useState("09:00");
  const whenISO = useMemo(() => {
    const [h, m] = time.split(":").map(Number);
    return day && Number.isFinite(h) ? zonedISO(day, h, m || 0) : null;
  }, [day, time]);
  const inPast = whenISO ? new Date(whenISO).getTime() < Date.now() + 60_000 : true;

  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      title={mode === "now" ? "Send this campaign now?" : "Schedule campaign"}
      subtitle={
        mode === "now"
          ? `It goes to ${count?.toLocaleString("en-US") ?? "your"} contacts, starting right away and pacing itself across your mailboxes.`
          : `Pick when it should start (${tzAbbrev()}).`
      }
      className="max-w-[500px]"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || (mode === "schedule" && inPast)} onClick={() => onConfirm(mode === "now" ? null : whenISO)}>
            {busy ? "Starting…" : mode === "now" ? "Send now" : "Schedule"}
          </Button>
        </>
      }
    >
      {mode === "schedule" ? (
        <div className="grid grid-cols-2 gap-5">
          <Field label="Date">
            <Input type="date" value={day} min={todayKey()} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label={`Time (${tzAbbrev()})`}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          {inPast && <p className="col-span-2 text-[12.5px] text-rose-600">Choose a time in the future.</p>}
          {whenISO && !inPast && <p className="col-span-2 text-[12.5px] text-neutral-500">Starts {formatDateTime(whenISO)} · {dayKey(whenISO) === todayKey() ? "today" : "on " + day}</p>}
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-neutral-600">You can pause or cancel it from the campaign report while it's sending.</p>
      )}
    </Modal>
  );
}
