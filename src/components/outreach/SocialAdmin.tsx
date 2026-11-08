"use client";

// Admin → Social: message templates, campaigns, reps' social accounts (daily limits),
// lead-source options, and the quick-add bookmarklet.

import { useEffect, useState } from "react";
import { Bookmark, Pencil, Plus, Trash2 } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useOutreach } from "@/components/providers/OutreachProvider";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Form";
import { Modal } from "@/components/ui/Overlay";
import { Segmented } from "@/components/ui/Segmented";
import { PlatformIcon } from "./PlatformIcon";
import { AgentAccess } from "./AgentAccess";
import {
  deleteOutreachCampaignAction,
  deleteOutreachTemplateAction,
  deleteSocialAccountAction,
  saveLeadSourcesAction,
  saveOutreachCampaignAction,
  saveOutreachTemplateAction,
  saveSocialAccountAction,
} from "@/server/outreach/actions";
import { CAMPAIGN_STATUSES, PLATFORMS, platformDef, platformLabel } from "@/lib/outreach/platforms";
import { mergeTemplate } from "@/lib/outreach/rules";
import { bookmarkletHref } from "@/lib/outreach/bookmarklet";
import type { OCampaign, OSocialAccount, OTemplate } from "@/lib/outreach/types";

type Sub = "templates" | "campaigns" | "accounts" | "sources" | "bookmarklet" | "agents";

export function SocialAdmin() {
  const [sub, setSub] = useState<Sub>("templates");
  return (
    <div className="flex flex-col gap-6">
      <Segmented<Sub>
        size="sm"
        value={sub}
        onChange={setSub}
        options={[
          { value: "templates", label: "Templates" },
          { value: "campaigns", label: "Campaigns" },
          { value: "accounts", label: "Social accounts" },
          { value: "sources", label: "Lead sources" },
          { value: "bookmarklet", label: "Bookmarklet" },
          { value: "agents", label: "Agent access (MCP)" },
        ]}
      />
      {sub === "templates" && <Templates />}
      {sub === "campaigns" && <Campaigns />}
      {sub === "accounts" && <Accounts />}
      {sub === "sources" && <Sources />}
      {sub === "bookmarklet" && <BookmarkletCard />}
      {sub === "agents" && <AgentAccess />}
    </div>
  );
}

function confirmDelete(what: string) {
  return window.confirm(`Delete ${what}? This can't be undone.`);
}

// ─── Templates ───────────────────────────────────────────────

function Templates() {
  const { data, act } = useOutreach();
  const [editing, setEditing] = useState<Partial<OTemplate> | null>(null);
  return (
    <Card>
      <CardHeader
        title="Message templates"
        subtitle="Use {first_name}, {company} and {job_title}. Reps copy these from the Social queue."
        actions={
          <Button size="sm" variant="brand" onClick={() => setEditing({ platform: "linkedin", active: true, name: "", body: "" })}>
            <Plus className="h-4 w-4" /> New template
          </Button>
        }
      />
      {data.templates.length === 0 ? (
        <Empty>No templates yet.</Empty>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {data.templates.map((t) => (
            <li key={t.id} className="flex items-start gap-4 py-4">
              <PlatformIcon platform={t.platform === "any" ? "email" : t.platform} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">
                  {t.name} {!t.active && <span className="ml-2 rounded-full bg-page px-2 py-0.5 text-[11px] text-neutral-500">Off</span>}
                </p>
                <p className="mt-1 line-clamp-2 text-[13px] text-neutral-500">{t.body}</p>
              </div>
              <IconButton label="Edit" size="sm" onClick={() => setEditing(t)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete" size="sm" onClick={() => confirmDelete(`"${t.name}"`) && act(deleteOutreachTemplateAction(t.id), "Template deleted")}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateModal value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TemplateModal({ value, onClose }: { value: Partial<OTemplate>; onClose: () => void }) {
  const { act } = useOutreach();
  const [t, setT] = useState({ name: value.name ?? "", platform: value.platform ?? "linkedin", body: value.body ?? "", active: value.active ?? true });
  const save = async () => {
    const r = await act(saveOutreachTemplateAction({ id: value.id, ...t }), "Template saved");
    if (r.ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={value.id ? "Edit template" : "New template"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={save} disabled={!t.name.trim() || !t.body.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Opener A" />
          </Field>
          <Field label="Platform">
            <Select value={t.platform} onChange={(e) => setT({ ...t, platform: e.target.value })}>
              <option value="any">Any platform</option>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Message" required hint="Merge fields: {first_name} {last_name} {company} {job_title}">
          <Textarea value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} rows={6} placeholder="Hi {first_name}, I came across {company}…" />
        </Field>
        {t.body && (
          <div className="rounded-2xl bg-soft p-4 text-[13px] leading-relaxed text-neutral-700">
            <p className="mb-1.5 text-[12px] text-neutral-400">Preview</p>
            {mergeTemplate(t.body, { decisionMakerName: "Jane Doe", businessName: "Acme Studio", jobTitle: "Founder" })}
          </div>
        )}
        <Toggle checked={t.active} onChange={(v: boolean) => setT({ ...t, active: v })} label="Active" />
      </div>
    </Modal>
  );
}

// ─── Campaigns ───────────────────────────────────────────────

function Campaigns() {
  const { data, act } = useOutreach();
  const [editing, setEditing] = useState<Partial<OCampaign> | null>(null);
  const counts = (id: string) => data.threads.filter((t) => t.campaignId === id).length;
  return (
    <Card>
      <CardHeader
        title="Campaigns"
        subtitle="Leads in an active campaign show up as “New” in reps' Social queue."
        actions={
          <Button size="sm" variant="brand" onClick={() => setEditing({ platform: "linkedin", status: "active" })}>
            <Plus className="h-4 w-4" /> New campaign
          </Button>
        }
      />
      {data.campaigns.length === 0 ? (
        <Empty>No campaigns yet.</Empty>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {data.campaigns.map((c) => (
            <li key={c.id} className="flex items-center gap-4 py-4">
              <PlatformIcon platform={c.platform} size={28} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium">{c.name}</p>
                <p className="mt-0.5 text-[12.5px] text-neutral-500">
                  {c.status} · {counts(c.id)} leads
                  {c.dailyLimit ? ` · ${c.dailyLimit}/day` : ""}
                  {c.templateId ? ` · ${data.templates.find((t) => t.id === c.templateId)?.name ?? ""}` : ""}
                </p>
              </div>
              <IconButton label="Edit" size="sm" onClick={() => setEditing(c)}>
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete" size="sm" onClick={() => confirmDelete(`"${c.name}" (leads stay, they just leave the campaign)`) && act(deleteOutreachCampaignAction(c.id), "Campaign deleted")}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {editing && <CampaignModal value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function CampaignModal({ value, onClose }: { value: Partial<OCampaign>; onClose: () => void }) {
  const { data, act } = useOutreach();
  const [c, setC] = useState({
    name: value.name ?? "",
    platform: value.platform ?? "linkedin",
    audience: value.audience ?? "",
    templateId: value.templateId ?? "",
    startDate: value.startDate?.slice(0, 10) ?? "",
    dailyLimit: value.dailyLimit ? String(value.dailyLimit) : "",
    goal: value.goal ?? "",
    status: value.status ?? "active",
  });
  const save = async () => {
    const r = await act(
      saveOutreachCampaignAction({
        id: value.id,
        ...c,
        templateId: c.templateId || null,
        startDate: c.startDate ? new Date(`${c.startDate}T00:00:00`).toISOString() : null,
        dailyLimit: c.dailyLimit ? Number(c.dailyLimit) : null,
      }),
      "Campaign saved"
    );
    if (r.ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={value.id ? "Edit campaign" : "New campaign"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={save} disabled={!c.name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Dental clinics — Texas" />
        </Field>
        <Field label="Platform">
          <Select value={c.platform} onChange={(e) => setC({ ...c, platform: e.target.value })}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={c.status} onChange={(e) => setC({ ...c, status: e.target.value })}>
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Template">
          <Select value={c.templateId} onChange={(e) => setC({ ...c, templateId: e.target.value })}>
            <option value="">None</option>
            {data.templates
              .filter((t) => t.platform === c.platform || t.platform === "any")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={c.startDate} onChange={(e) => setC({ ...c, startDate: e.target.value })} />
        </Field>
        <Field label="Daily limit" hint="New leads per day you plan to reach.">
          <Input type="number" min={0} value={c.dailyLimit} onChange={(e) => setC({ ...c, dailyLimit: e.target.value })} />
        </Field>
        <Field label="Audience" className="sm:col-span-2">
          <Textarea value={c.audience} onChange={(e) => setC({ ...c, audience: e.target.value })} rows={2} placeholder="Owners of dental clinics, 2–20 staff" />
        </Field>
        <Field label="Goal" className="sm:col-span-2">
          <Input value={c.goal} onChange={(e) => setC({ ...c, goal: e.target.value })} placeholder="10 calls booked" />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Social accounts / daily limits ──────────────────────────

function Accounts() {
  const { data, act } = useOutreach();
  const { data: crm } = useCrm();
  const reps = crm.users.filter((u) => u.active);
  const [editing, setEditing] = useState<Partial<OSocialAccount> | null>(null);
  return (
    <Card>
      <CardHeader
        title="Social accounts"
        subtitle="Each rep's account per platform and how many they may send a day. Warns at 80%, blocks at 100% (admins can override). Without an account, platform defaults apply."
        actions={
          <Button size="sm" variant="brand" onClick={() => setEditing({ platform: "linkedin", userId: reps[0]?.id })}>
            <Plus className="h-4 w-4" /> Add account
          </Button>
        }
      />
      {data.accounts.length === 0 ? (
        <Empty>No accounts yet. Defaults: LinkedIn 20 connections + 50 DMs a day; other networks 40–50 DMs.</Empty>
      ) : (
        <table className="w-full text-[13.5px]">
          <thead className="text-left text-[12px] text-neutral-400">
            <tr>
              <th className="pb-3 font-normal">Rep</th>
              <th className="pb-3 font-normal">Platform</th>
              <th className="pb-3 font-normal">Handle</th>
              <th className="pb-3 text-right font-normal">Connections / day</th>
              <th className="pb-3 text-right font-normal">DMs / day</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.id} className="border-t border-neutral-100">
                <td className="py-3">{crm.users.find((u) => u.id === a.userId)?.name ?? "—"}</td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-2">
                    <PlatformIcon platform={a.platform} size={20} /> {platformLabel(a.platform)}
                  </span>
                </td>
                <td className="py-3 text-neutral-500">{a.handle}</td>
                <td className="py-3 text-right tabular-nums">{platformDef(a.platform)?.hasConnections ? a.dailyConnectionLimit : "—"}</td>
                <td className="py-3 text-right tabular-nums">{a.dailyDmLimit}</td>
                <td className="py-3 text-right">
                  <span className="inline-flex gap-1">
                    <IconButton label="Edit" size="sm" onClick={() => setEditing(a)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Delete" size="sm" onClick={() => confirmDelete("this account") && act(deleteSocialAccountAction(a.id), "Account removed")}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && <AccountModal value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function AccountModal({ value, onClose }: { value: Partial<OSocialAccount>; onClose: () => void }) {
  const { act } = useOutreach();
  const { data: crm } = useCrm();
  const def = (p: string) => platformDef(p)!;
  const [a, setA] = useState({
    userId: value.userId ?? "",
    platform: value.platform ?? "linkedin",
    handle: value.handle ?? "",
    dailyConnectionLimit: String(value.dailyConnectionLimit ?? def(value.platform ?? "linkedin").defaultConnectionLimit),
    dailyDmLimit: String(value.dailyDmLimit ?? def(value.platform ?? "linkedin").defaultDmLimit),
  });
  const save = async () => {
    const r = await act(
      saveSocialAccountAction({ id: value.id, ...a, dailyConnectionLimit: Number(a.dailyConnectionLimit) || 0, dailyDmLimit: Number(a.dailyDmLimit) || 0 }),
      "Account saved"
    );
    if (r.ok) onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={value.id ? "Edit account" : "Add social account"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="brand" onClick={save} disabled={!a.userId}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="Rep" required>
          <Select value={a.userId} onChange={(e) => setA({ ...a, userId: e.target.value })}>
            <option value="">Choose…</option>
            {crm.users
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Platform">
          <Select
            value={a.platform}
            onChange={(e) => {
              const p = e.target.value;
              setA({ ...a, platform: p, dailyConnectionLimit: String(def(p).defaultConnectionLimit), dailyDmLimit: String(def(p).defaultDmLimit) });
            }}
          >
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Handle / profile" className="sm:col-span-2">
          <Input value={a.handle} onChange={(e) => setA({ ...a, handle: e.target.value })} placeholder="@agency.rep or profile URL" />
        </Field>
        {def(a.platform).hasConnections && (
          <Field label="Connection requests / day" hint="0 = no limit">
            <Input type="number" min={0} value={a.dailyConnectionLimit} onChange={(e) => setA({ ...a, dailyConnectionLimit: e.target.value })} />
          </Field>
        )}
        <Field label="DMs / day" hint="Includes follow-ups, voice notes and story replies. 0 = no limit">
          <Input type="number" min={0} value={a.dailyDmLimit} onChange={(e) => setA({ ...a, dailyDmLimit: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Lead sources ────────────────────────────────────────────

function Sources() {
  const { data, act } = useOutreach();
  const [text, setText] = useState(data.leadSources.join("\n"));
  useEffect(() => setText(data.leadSources.join("\n")), [data.leadSources]);
  return (
    <Card>
      <CardHeader title="Lead sources" subtitle="The options in the lead source dropdown (imports and social leads). One per line." />
      <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} />
      <div className="mt-4 flex justify-end">
        <Button onClick={() => act(saveLeadSourcesAction(text.split("\n")), "Lead sources saved")}>Save</Button>
      </div>
    </Card>
  );
}

// ─── Bookmarklet ─────────────────────────────────────────────

export function BookmarkletCard() {
  const [href, setHref] = useState("");
  useEffect(() => setHref(bookmarkletHref(window.location.origin)), []);
  return (
    <Card>
      <CardHeader title="Quick-add bookmarklet" subtitle="Add the profile you're looking at to the CRM in one click — no copy-pasting." />
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13.5px] leading-relaxed text-neutral-600">
        <li>Show your bookmarks bar (Ctrl+Shift+B / ⌘+Shift+B).</li>
        <li>Drag the button below onto the bar.</li>
        <li>On any LinkedIn, Facebook, Instagram, Threads, X or TikTok profile, click it. A small CRM window opens, checks for duplicates, and adds the lead.</li>
      </ol>
      <div className="mt-6">
        {href && (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              alert("Drag this button to your bookmarks bar, then click it while you're on a profile.");
            }}
            className="inline-flex h-11 cursor-grab items-center gap-2 rounded-full bg-brand px-5 text-[14px] text-brand-fg"
          >
            <Bookmark className="h-4 w-4" /> + Add to CRM
          </a>
        )}
      </div>
      <p className="mt-4 text-[12px] text-neutral-400">You need to be signed in to the CRM in this browser. Developers: POST /api/outreach/quick-add {"{url, name?, title?, company?}"}.</p>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-soft px-5 py-10 text-center text-[13.5px] text-neutral-500">{children}</p>;
}
