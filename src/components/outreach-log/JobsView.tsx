"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, CalendarCheck, ExternalLink, FileCheck2, Gift, MailOpen, Plus, Send, StickyNote, Trash2, XCircle } from "lucide-react";
import type { JobApplication, LogAccount } from "@prisma/client";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { Field, Input, Select, Textarea, SearchInput } from "@/components/ui/Form";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/utils";
import { JOB_SOURCES, JOB_STAGES, JOB_STAGE_LABEL, jobSourceLabel, type JobEvent, type JobStage } from "@/lib/outreach-log/constants";
import {
  createJobApplication,
  deleteJobApplication,
  logJobTouch,
  setJobApplicationFollowup,
  setJobApplicationStage,
  updateJobApplication,
} from "@/server/outreach-log/actions";
import { AccountSelect, DueText, StagePill, Timeline, toLocalInput, useLogAction } from "./shared";

type Filter = "all" | "due" | "active" | "closed";
const CLOSED = ["hired", "rejected", "ghosted", "withdrawn"];

export function JobsView({ jobs, accounts }: { jobs: JobApplication[]; accounts: LogAccount[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [source, setSource] = useState("");
  const [stage, setStage] = useState("");

  useEffect(() => {
    if (params.get("new")) setAdding(true);
    const id = params.get("job");
    if (id) setOpenId(id);
  }, [params]);

  const endOfDay = new Date().setHours(23, 59, 59, 999);
  const isDue = (j: JobApplication) => !!j.nextFollowupAt && new Date(j.nextFollowupAt).getTime() <= endOfDay;
  const closed = (j: JobApplication) => CLOSED.includes(j.stage);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return jobs
      .filter((j) => (filter === "due" ? isDue(j) : filter === "active" ? !closed(j) : filter === "closed" ? closed(j) : true))
      .filter((j) => !source || j.source === source)
      .filter((j) => !stage || j.stage === stage)
      .filter((j) => !term || [j.title, j.company, j.location, j.contactName].some((v) => v.toLowerCase().includes(term)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, q, filter, source, stage]);

  const stats = useMemo(() => {
    const applied = jobs.filter((j) => j.appliedAt).length;
    const responded = jobs.filter((j) => j.lastInboundAt).length;
    const interviews = jobs.filter((j) => ["interview", "assessment", "offer", "hired"].includes(j.stage)).length;
    return { applied, responded, interviews, rate: applied ? Math.round((responded / applied) * 100) : 0 };
  }, [jobs]);

  const open = jobs.find((j) => j.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="Job applications"
        subtitle="Remote jobs you applied to, from every board — with follow-ups and stages tracked for you."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Log application
          </Button>
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Applied", stats.applied],
          ["Got a response", stats.responded],
          ["Interviews+", stats.interviews],
          ["Response rate", `${stats.rate}%`],
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
            { value: "active", label: "Active", count: jobs.filter((j) => !closed(j)).length },
            { value: "due", label: "Due", count: jobs.filter(isDue).length },
            { value: "closed", label: "Closed" },
            { value: "all", label: "All", count: jobs.length },
          ]}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
          <option value="">All sources</option>
          {JOB_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="h-11 rounded-full border border-black/[0.08] bg-white px-4 text-[13.5px]">
          <option value="">All stages</option>
          {JOB_STAGES.map((s) => <option key={s} value={s}>{JOB_STAGE_LABEL[s]}</option>)}
        </select>
        <div className="ml-auto w-full sm:w-[280px]">
          <SearchInput value={q} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQ(e.target.value)} placeholder="Search title, company…" />
        </div>
      </div>

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={jobs.length ? "Nothing matches these filters" : "No applications logged yet"}
            body={jobs.length ? undefined : "Log each job you apply to — a follow-up is scheduled 7 days later."}
            action={!jobs.length && <Button onClick={() => setAdding(true)}>Log application</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="text-[12.5px] uppercase tracking-[0.04em] text-neutral-400">
                  <th className="px-6 py-4 font-normal">Role</th>
                  <th className="px-4 py-4 font-normal">Source</th>
                  <th className="px-4 py-4 font-normal">Stage</th>
                  <th className="px-4 py-4 font-normal">Applied</th>
                  <th className="px-6 py-4 font-normal">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((j) => (
                  <tr key={j.id} onClick={() => setOpenId(j.id)} className="cursor-pointer border-t border-black/[0.05] transition-colors hover:bg-page/60">
                    <td className="px-6 py-4">
                      <p className="text-[14.5px] font-medium">{j.title}</p>
                      <p className="mt-0.5 truncate text-[12.5px] text-neutral-500">{[j.company, j.location, j.salary].filter(Boolean).join(" · ")}</p>
                    </td>
                    <td className="px-4 py-4 text-[13.5px] text-neutral-600">{jobSourceLabel(j.source)}</td>
                    <td className="px-4 py-4"><StagePill kind="job" stage={j.stage} /></td>
                    <td className="px-4 py-4 text-[13px] text-neutral-500">{j.appliedAt ? new Date(j.appliedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"}</td>
                    <td className="px-6 py-4"><DueText at={j.nextFollowupAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-4 text-[12.5px] text-neutral-400">Automatic follow-ups: 7 days after applying, then 7 more. No reply after the second follow-up → “Ghosted”. Interviews get a follow-up the next day.</p>

      <AddJobModal open={adding} onClose={() => { setAdding(false); if (params.get("new")) router.replace("/log/jobs"); }} accounts={accounts} />
      {open && <JobDrawer job={open} accounts={accounts} onClose={() => { setOpenId(null); if (params.get("job")) router.replace("/log/jobs"); }} />}
    </div>
  );
}

function AddJobModal({ open, onClose, accounts }: { open: boolean; onClose: () => void; accounts: LogAccount[] }) {
  const { run, pending } = useLogAction();
  const blank = { title: "", company: "", source: "linkedin", url: "", location: "Remote", salary: "", accountId: "", contactName: "", contactInfo: "", notes: "", stage: "applied" as "applied" | "saved" };
  const [f, setF] = useState(blank);
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (await run(() => createJobApplication({ ...f, accountId: f.accountId || null }), f.stage === "applied" ? "Logged — follow-up in 7 days" : "Saved")) {
      setF({ ...blank, source: f.source });
      onClose();
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log job application"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={pending || !f.title.trim()}>{f.stage === "applied" ? "Log application" : "Save job"}</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Job title" required className="sm:col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Senior WordPress Developer" /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Source" required>
          <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
            {JOB_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Job / proposal URL" className="sm:col-span-2" hint="Used to stop the same job being logged twice."><Input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://…" /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Salary / rate"><Input value={f.salary} onChange={(e) => set("salary", e.target.value)} placeholder="$40/hr" /></Field>
        <Field label="Applied with account" hint="e.g. your Upwork profile or job-hunt inbox."><AccountSelect accounts={accounts} value={f.accountId} onChange={(v) => set("accountId", v)} /></Field>
        <Field label="Status">
          <Select value={f.stage} onChange={(e) => set("stage", e.target.value as "applied" | "saved")}>
            <option value="applied">Applied</option>
            <option value="saved">Saved — not applied yet</option>
          </Select>
        </Field>
        <Field label="Recruiter / contact"><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
        <Field label="Contact email / handle"><Input value={f.contactInfo} onChange={(e) => set("contactInfo", e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

const EVENTS: { ev: JobEvent; label: string; icon: typeof Send }[] = [
  { ev: "followup", label: "Follow-up sent", icon: Send },
  { ev: "response", label: "Got a response", icon: MailOpen },
  { ev: "interview", label: "Interview", icon: CalendarCheck },
  { ev: "assessment", label: "Assessment", icon: FileCheck2 },
  { ev: "offer", label: "Offer", icon: Gift },
  { ev: "rejected", label: "Rejected", icon: XCircle },
  { ev: "applied", label: "Applied", icon: Briefcase },
  { ev: "note", label: "Note", icon: StickyNote },
];

function JobDrawer({ job: j, accounts, onClose }: { job: JobApplication; accounts: LogAccount[]; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const [version, setVersion] = useState(0);
  const [ev, setEv] = useState<JobEvent>(j.appliedAt ? "followup" : "applied");
  const [text, setText] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [editing, setEditing] = useState(false);

  const log = async () => {
    const r = await run(
      () => logJobTouch(j.id, ev, { text, interviewAt: ev === "interview" && interviewAt ? new Date(interviewAt).toISOString() : undefined }),
      ev === "note" ? "Note saved" : "Logged"
    );
    if (r) {
      setText("");
      setVersion((v) => v + 1);
    }
  };

  return (
    <Drawer open onClose={onClose}>
      <div className="flex-1 overflow-y-auto px-8 pb-10 pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[24px] font-medium tracking-[-0.015em]">{j.title}</h2>
            <p className="mt-1.5 text-[13.5px] text-neutral-500">{[j.company, j.location, j.salary].filter(Boolean).join(" · ")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <StagePill kind="job" stage={j.stage} />
              <span className="text-[13px] text-neutral-600">{jobSourceLabel(j.source)}</span>
              {j.accountId && <span className="text-[13px] text-neutral-400">· {accounts.find((a) => a.id === j.accountId)?.label}</span>}
              {j.url && (
                <a href={j.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-ink underline-offset-4 hover:underline">
                  Open post <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            {(j.contactName || j.contactInfo) && <p className="mt-3 text-[13px] text-neutral-500">Contact: {[j.contactName, j.contactInfo].filter(Boolean).join(" · ")}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-4 rounded-[20px] bg-page p-5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.05em] text-neutral-400">Next follow-up</p>
            <DueText at={j.nextFollowupAt} className="mt-2 block text-[15px]" />
            <input
              type="datetime-local"
              className="mt-3 h-9 w-full rounded-lg border border-black/[0.08] bg-white px-3 text-[13px]"
              defaultValue={j.nextFollowupAt ? toLocalInput(new Date(j.nextFollowupAt)) : ""}
              onBlur={(e) => {
                const v = e.target.value;
                const cur = j.nextFollowupAt ? toLocalInput(new Date(j.nextFollowupAt)) : "";
                if (v !== cur) void run(() => setJobApplicationFollowup(j.id, v ? new Date(v).toISOString() : null), "Follow-up date set");
              }}
            />
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.05em] text-neutral-400">{j.interviewAt ? "Interview" : "Follow-ups sent"}</p>
            <p className="mt-2 text-[18px] tabular-nums">{j.interviewAt ? new Date(j.interviewAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : j.followupCount}</p>
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
          {ev === "interview" && (
            <label className="mt-4 flex items-center gap-3 text-[13px] text-neutral-500">
              Interview time
              <input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} className="h-10 rounded-lg border border-black/[0.08] px-3 text-[13px]" />
            </label>
          )}
          <Textarea className="mt-4" value={text} onChange={(e) => setText(e.target.value)} placeholder="Details (optional)" />
          <div className="mt-4 flex justify-end">
            <Button onClick={log} disabled={pending || (ev === "note" && !text.trim())}>Save</Button>
          </div>
        </section>

        <section className="mt-8">
          <p className="mb-3 text-[13px] text-neutral-500">Set stage</p>
          <div className="flex flex-wrap gap-2">
            {(["hired", "withdrawn", "ghosted", "saved"] as JobStage[]).map((s) => (
              <Button key={s} size="sm" variant={j.stage === s ? "primary" : "secondary"} disabled={pending} onClick={async () => (await run(() => setJobApplicationStage(j.id, s), `Moved to ${JOB_STAGE_LABEL[s]}`)) && setVersion((v) => v + 1)}>
                {JOB_STAGE_LABEL[s]}
              </Button>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[15px] font-medium">Timeline</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit details</Button>
              <Button size="sm" variant="danger" onClick={async () => confirm(`Delete “${j.title}”?`) && (await run(() => deleteJobApplication(j.id), "Deleted")) && onClose()}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <Timeline kind="job" id={j.id} version={version + new Date(j.updatedAt).getTime()} />
        </section>
      </div>
      {editing && <EditJobModal job={j} accounts={accounts} onClose={() => setEditing(false)} />}
    </Drawer>
  );
}

function EditJobModal({ job: j, accounts, onClose }: { job: JobApplication; accounts: LogAccount[]; onClose: () => void }) {
  const { run, pending } = useLogAction();
  const [f, setF] = useState({ title: j.title, company: j.company, source: j.source, url: j.url, location: j.location, salary: j.salary, accountId: j.accountId ?? "", contactName: j.contactName, contactInfo: j.contactInfo, notes: j.notes ?? "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit application"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={pending} onClick={async () => (await run(() => updateJobApplication(j.id, { ...f, accountId: f.accountId || null }), "Saved")) && onClose()}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Title" className="sm:col-span-2"><Input value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Source">
          <Select value={f.source} onChange={(e) => set("source", e.target.value)}>
            {JOB_SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="URL" className="sm:col-span-2"><Input value={f.url} onChange={(e) => set("url", e.target.value)} /></Field>
        <Field label="Location"><Input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Salary"><Input value={f.salary} onChange={(e) => set("salary", e.target.value)} /></Field>
        <Field label="Account"><AccountSelect accounts={accounts} value={f.accountId} onChange={(v) => set("accountId", v)} /></Field>
        <Field label="Contact"><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
        <Field label="Contact email / handle" className="sm:col-span-2"><Input value={f.contactInfo} onChange={(e) => set("contactInfo", e.target.value)} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
