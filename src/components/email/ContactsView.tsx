"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Contact,
  ExternalLink,
  MailX,
  RotateCcw,
  Send,
  Tag,
  Upload,
  Workflow,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Checkbox, Field, FilterSelect, Input, SearchInput } from "@/components/ui/Form";
import { Drawer, Modal } from "@/components/ui/Overlay";
import { PageHeader, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { StageLabel, StatusDot, Chip } from "@/components/ui/Badges";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { CsvImportModal } from "@/components/leads/CsvImportModal";
import { cn } from "@/lib/utils";
import { dayKey, dayLabel, formatDateTime } from "@/lib/date";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/lib/constants";
import { CONTACT_STATUS_COLOR, CONTACT_STATUS_LABELS, type ContactStatus } from "@/lib/email";
import type { AutomationView, ContactActivity, ContactView } from "@/lib/email-types";
import { enrollContactsAction, getContactActivityAction, handoffContactsAction, setSubscriptionAction, updateContactTagsAction } from "@/server/email/actions";
import { HandoffButton } from "./HandoffButton";
import { deleteLeadsAction } from "@/server/actions";
import { DeleteLeadsWarning } from "@/components/shared/DeleteLeadsWarning";
import { useCrm } from "@/components/providers/CrmProvider";
import { HANDOFF_KEY } from "./CampaignEditor";
import { MultiPick } from "./MultiPick";
import { recipientState } from "./CampaignReport";
import { Eyebrow, useEmailAction } from "./kit";

type Props = {
  contacts: ContactView[];
  total: number;
  page: number;
  pages: number;
  tags: string[];
  automations: Pick<AutomationView, "id" | "name" | "status">[];
  focus: ContactView | null;
  reps: { id: string; name: string }[];
};

const STATUS_TABS: { value: "" | ContactStatus; label: string }[] = [
  { value: "", label: "All" },
  { value: "SUBSCRIBED", label: "Subscribed" },
  { value: "UNSUBSCRIBED", label: "Unsubscribed" },
  { value: "BOUNCED", label: "Bounced" },
  { value: "NO_EMAIL", label: "No email" },
];

export function ContactsView({ contacts, total, page, pages, tags, automations, focus, reps }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { run, busy } = useEmailAction();
  const { confirm, dialog } = useConfirm();
  const { perms } = useCrm();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(params.get("import") === "1");
  const [tagModal, setTagModal] = useState<null | "add" | "remove">(null);
  const [enrollOpen, setEnrollOpen] = useState(false);

  const setParams = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) (v ? p.set(k, v) : p.delete(k));
    if (!("page" in patch)) p.delete("page");
    router.replace(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  // Debounced server-side search.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => setParams({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => setSelected(new Set()), [params]);

  const openId = params.get("contact");
  const open = useMemo(() => contacts.find((c) => c.id === openId) ?? (focus?.id === openId ? focus : null), [contacts, focus, openId]);
  const ids = [...selected];
  const allOnPage = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const status = params.get("status") ?? "";
  const filtering = !!(params.get("q") || status || params.get("tag") || params.get("stage"));

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Every CRM lead is a contact. Unsubscribes and bounces are respected in every campaign and automation."
        actions={
          <Button variant="secondary" size="lg" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
        }
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search business, contact, email or city" className="h-11 w-full md:w-[380px]" />
          <Segmented value={status as "" | ContactStatus} onChange={(v) => setParams({ status: v || null })} options={STATUS_TABS} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <FilterSelect value={params.get("tag") ?? ""} onChange={(e) => setParams({ tag: e.target.value || null })} active={!!params.get("tag")}>
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={params.get("stage") ?? ""} onChange={(e) => setParams({ stage: e.target.value || null })} active={!!params.get("stage")}>
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </FilterSelect>
          {filtering && (
            <Button
              variant="link"
              size="sm"
              className="ml-1 text-[13px]"
              onClick={() => {
                setQ("");
                router.replace(pathname, { scroll: false });
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      <Card className="mt-6 p-0">
        <div className="flex min-h-[76px] flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-white">
              <span className="mr-2 text-[13px]">{selected.size} selected</span>
              <BulkBtn
                icon={Send}
                label="Email them"
                onClick={() => {
                  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(ids));
                  router.push("/email/campaigns/new?from=contacts");
                }}
              />
              <BulkBtn icon={Workflow} label="Add to automation" onClick={() => setEnrollOpen(true)} />
              <HandoffButton reps={reps} label="Send to calls" count={ids.length} variant="brand" onHandoff={(rep) => handoffContactsAction(ids, rep)} />
              <BulkBtn icon={Tag} label="Tag" onClick={() => setTagModal("add")} />
              <BulkBtn icon={X} label="Untag" onClick={() => setTagModal("remove")} />
              <BulkBtn
                icon={MailX}
                label="Unsubscribe"
                onClick={() =>
                  confirm({
                    title: `Unsubscribe ${selected.size} contact${selected.size === 1 ? "" : "s"}?`,
                    body: "They won't receive any campaign or automation emails until resubscribed.",
                    confirmLabel: "Unsubscribe",
                    danger: true,
                    run: () => run("unsub", setSubscriptionAction(ids, false), "Unsubscribed"),
                  })
                }
              />
              {perms.deleteLeads && (
                <BulkBtn
                  icon={Trash2}
                  label="Delete"
                  onClick={() =>
                    confirm({
                      title: `Delete ${ids.length} contact${ids.length === 1 ? "" : "s"}?`,
                      body: <DeleteLeadsWarning count={ids.length} />,
                      confirmLabel: "Delete permanently",
                      danger: true,
                      run: () => run("delete", deleteLeadsAction(ids), (r) => `${r.deleted} deleted`),
                    })
                  }
                />
              )}
              <button onClick={() => setSelected(new Set())} className="h-8 rounded-full px-3 text-[12.5px] text-white/70 hover:text-white">
                Clear
              </button>
            </div>
          ) : (
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">
              {total.toLocaleString("en-US")} contact{total === 1 ? "" : "s"}
            </h2>
          )}
        </div>

        {contacts.length === 0 ? (
          <EmptyState
            icon={Contact}
            title={filtering ? "No contacts match" : "No contacts yet"}
            body={filtering ? "Try another filter or search." : "Import a CSV, or add leads with an email address in the Cold Calling CRM — they show up here automatically."}
            action={!filtering ? <Button onClick={() => setImportOpen(true)}><Upload className="h-4 w-4" /> Import CSV</Button> : undefined}
            className="pb-16"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse">
              <thead>
                <tr className="text-left text-[12.5px] text-neutral-700">
                  <th className="w-[52px] border-y border-neutral-100 py-3.5 pl-7 font-normal">
                    <Checkbox
                      label="Select page"
                      checked={allOnPage}
                      indeterminate={!allOnPage && contacts.some((c) => selected.has(c.id))}
                      onChange={(on) => setSelected(on ? new Set(contacts.map((c) => c.id)) : new Set())}
                    />
                  </th>
                  {["Contact", "Email", "Status", "Tags", "Stage", "Emails", "Last emailed"].map((h) => (
                    <th key={h} className="border-y border-neutral-100 py-3.5 pr-4 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setParams({ contact: c.id, page: params.get("page") })}
                    className={cn("cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/80", selected.has(c.id) && "bg-brand-50/50")}
                  >
                    <td className="py-4 pl-7">
                      <Checkbox
                        label={`Select ${c.businessName}`}
                        checked={selected.has(c.id)}
                        onChange={(on) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            on ? n.add(c.id) : n.delete(c.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="py-4 pr-4">
                      <p className="max-w-[240px] truncate font-medium">{c.businessName}</p>
                      <p className="mt-0.5 max-w-[240px] truncate text-[11.5px] text-neutral-500">{[c.contactName, c.city].filter(Boolean).join(" · ") || "—"}</p>
                    </td>
                    <td className="max-w-[240px] truncate py-4 pr-4 text-ink">{c.email || <span className="text-neutral-400">—</span>}</td>
                    <td className="py-4 pr-4">
                      <StatusDot color={CONTACT_STATUS_COLOR[c.status]} label={CONTACT_STATUS_LABELS[c.status]} />
                    </td>
                    <td className="py-4 pr-4">
                      <div className="flex max-w-[220px] flex-wrap gap-1.5">
                        {c.tags.slice(0, 3).map((t) => (
                          <Chip key={t} className="h-6 px-2.5 text-[11.5px]">{t}</Chip>
                        ))}
                        {c.tags.length > 3 && <span className="text-[11.5px] text-neutral-500">+{c.tags.length - 3}</span>}
                        {!c.tags.length && <span className="text-neutral-400">—</span>}
                      </div>
                    </td>
                    <td className="py-4 pr-4">
                      <StageLabel stage={c.stage} />
                    </td>
                    <td className="whitespace-nowrap py-4 pr-4 tabular-nums text-neutral-600">
                      {c.sent ? (
                        <>
                          <span className="text-ink">{c.sent}</span> sent · {c.opened} opened{c.replied ? ` · ${c.replied} replied` : ""}
                        </>
                      ) : (
                        <span className="text-neutral-400">None yet</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-4 pr-7 text-neutral-600">{c.lastEmailedAt ? dayLabel(dayKey(c.lastEmailedAt)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 px-7 py-5">
            <p className="text-[13px] text-neutral-500">
              Page {page} of {pages}
            </p>
            <div className="flex items-center gap-2">
              <IconButton label="Previous page" variant="white" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <IconButton label="Next page" variant="white" disabled={page >= pages} onClick={() => setParams({ page: String(page + 1) })}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        )}
      </Card>

      <ContactDrawer contact={open} reps={reps} onClose={() => setParams({ contact: null, page: params.get("page") })} allTags={tags} />
      <CsvImportModal open={importOpen} mode="email" onClose={() => setImportOpen(false)} onImported={() => router.refresh()} />

      <Modal
        open={!!tagModal}
        onClose={() => setTagModal(null)}
        title={tagModal === "add" ? `Tag ${selected.size} contacts` : `Remove a tag from ${selected.size} contacts`}
        subtitle={tagModal === "add" ? "Tags group contacts for campaigns and can start automations." : undefined}
        className="max-w-[480px]"
      >
        <TagPicker
          tags={tags}
          busy={busy === "tags"}
          verb={tagModal === "add" ? "Add tag" : "Remove tag"}
          allowNew={tagModal === "add"}
          onPick={async (tag) => {
            const r = await run("tags", updateContactTagsAction(ids, tagModal === "add" ? [tag] : [], tagModal === "remove" ? [tag] : []), "Tags updated");
            if (r !== null) setTagModal(null);
          }}
        />
      </Modal>

      <Modal open={enrollOpen} onClose={() => setEnrollOpen(false)} title={`Add ${selected.size} contacts to an automation`} className="max-w-[480px]">
        {automations.length === 0 ? (
          <p className="text-[14px] text-neutral-600">
            You haven't built an automation yet.{" "}
            <Link href="/email/automations/new" className="underline underline-offset-4">
              Create one
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {automations.map((a) => (
              <button
                key={a.id}
                disabled={busy === "enroll"}
                onClick={async () => {
                  const r = await run("enroll", enrollContactsAction(a.id, ids), (d) => `${d.enrolled} added${d.skipped ? ` · ${d.skipped} skipped (already in it or can't be emailed)` : ""}`);
                  if (r) setEnrollOpen(false);
                }}
                className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-5 py-4 text-left transition-colors hover:bg-page"
              >
                <span className="text-[14px] font-medium">{a.name}</span>
                <span className="text-[12px] text-neutral-500">{a.status === "ACTIVE" ? "Active" : "Paused — starts when activated"}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  );
}

function BulkBtn({ icon: Icon, label, onClick }: { icon: typeof Send; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[12.5px] text-white transition-colors hover:bg-white/20">
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function TagPicker({ tags, onPick, verb, allowNew, busy }: { tags: string[]; onPick: (t: string) => void; verb: string; allowNew: boolean; busy: boolean }) {
  const [tag, setTag] = useState("");
  return (
    <div className="flex flex-col gap-5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(t)} className={cn("h-9 rounded-full px-4 text-[13px] transition-colors", tag === t ? "bg-ink text-white" : "bg-page hover:bg-neutral-200/70")}>
              {t}
            </button>
          ))}
        </div>
      )}
      {allowNew && (
        <Field label="Or a new tag">
          <Input value={tag} maxLength={40} placeholder="e.g. Dentists — Boston" onChange={(e) => setTag(e.target.value)} />
        </Field>
      )}
      <Button disabled={!tag.trim() || busy} onClick={() => onPick(tag.trim())}>
        {busy ? "Saving…" : verb}
      </Button>
    </div>
  );
}

function ContactDrawer({ contact, onClose, allTags, reps }: { contact: ContactView | null; onClose: () => void; allTags: string[]; reps: { id: string; name: string }[] }) {
  const { run, busy } = useEmailAction();
  const { perms } = useCrm();
  const { confirm, dialog } = useConfirm();
  const [activity, setActivity] = useState<ContactActivity | null>(null);
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    setActivity(null);
    if (!contact) return;
    setTags(contact.tags);
    let live = true;
    getContactActivityAction(contact.id).then((r) => live && r.ok && setActivity(r.data));
    return () => {
      live = false;
    };
  }, [contact]);

  if (!contact) return null;
  const tagsChanged = tags.join("|") !== contact.tags.join("|");

  return (
    <Drawer open={!!contact} onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-8 pb-6 pt-7">
        <div className="min-w-0">
          <p className="truncate text-[22px] font-medium tracking-[-0.015em]">{contact.businessName}</p>
          <p className="mt-1.5 truncate text-[13.5px] text-neutral-500">{[contact.contactName, contact.email].filter(Boolean).join(" · ")}</p>
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto px-8 py-7">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-soft p-5">
            <Eyebrow>Email status</Eyebrow>
            <div className="mt-3">
              <StatusDot color={CONTACT_STATUS_COLOR[contact.status]} label={CONTACT_STATUS_LABELS[contact.status]} />
            </div>
          </div>
          <div className="rounded-2xl bg-soft p-5">
            <Eyebrow>Pipeline</Eyebrow>
            <div className="mt-3">
              <StageLabel stage={contact.stage} />
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contact.status === "SUBSCRIBED" ? (
            <Button variant="secondary" size="sm" disabled={busy === "sub"} onClick={() => run("sub", setSubscriptionAction([contact.id], false), "Unsubscribed")}>
              <MailX className="h-3.5 w-3.5" /> Unsubscribe
            </Button>
          ) : contact.status !== "NO_EMAIL" ? (
            <Button variant="secondary" size="sm" disabled={busy === "sub"} onClick={() => run("sub", setSubscriptionAction([contact.id], true), "Resubscribed")}>
              <RotateCcw className="h-3.5 w-3.5" /> {contact.status === "BOUNCED" ? "Clear bounce" : "Resubscribe"}
            </Button>
          ) : null}
          <HandoffButton reps={reps} variant="secondary" onHandoff={(rep) => handoffContactsAction([contact.id], rep)} />
          <Link href={`/leads?lead=${contact.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-page px-4 text-[13px] hover:bg-neutral-200/80">
            <ExternalLink className="h-3.5 w-3.5" /> Open in Cold Calling CRM
          </Link>
          {perms.deleteLeads && (
            <Button
              variant="danger"
              size="sm"
              onClick={() =>
                confirm({
                  title: `Delete ${contact.businessName}?`,
                  body: <DeleteLeadsWarning count={1} />,
                  confirmLabel: "Delete permanently",
                  danger: true,
                  run: async () => {
                    if (await run("delete", deleteLeadsAction([contact.id]), "Contact deleted")) onClose();
                  },
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>

        <div className="mt-8">
          <Eyebrow className="mb-3">Tags</Eyebrow>
          <div className="flex flex-wrap items-center gap-2.5">
            <MultiPick label="Add tags" options={[...new Set([...allTags, ...tags])].map((t) => ({ value: t, label: t }))} value={tags} onChange={setTags} allowCustom />
            {tagsChanged && (
              <Button
                size="sm"
                disabled={busy === "tags"}
                onClick={() =>
                  run(
                    "tags",
                    updateContactTagsAction([contact.id], tags.filter((t) => !contact.tags.includes(t)), contact.tags.filter((t) => !tags.includes(t))),
                    "Tags saved"
                  )
                }
              >
                Save tags
              </Button>
            )}
          </div>
        </div>

        <div className="mt-9">
          <Eyebrow className="mb-4">Email history</Eyebrow>
          {!activity ? (
            <p className="text-[13px] text-neutral-500">Loading…</p>
          ) : activity.sends.length === 0 ? (
            <p className="text-[13px] text-neutral-500">No emails sent to this contact yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activity.sends.map((s) => {
                const st = recipientState({ ...s, leadId: null, businessName: "", contactName: "", email: "", error: null, openCount: 0, accountEmail: null });
                return (
                  <li key={s.id} className="rounded-2xl border border-neutral-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-medium">{s.subject || "(no subject)"}</p>
                        <p className="mt-1 truncate text-[12px] text-neutral-500">{s.source}</p>
                      </div>
                      <StatusDot color={st.color} label={st.label} className="shrink-0" />
                    </div>
                    {s.sentAt && <p className="mt-2 text-[12px] text-neutral-500">Sent {formatDateTime(s.sentAt)}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {activity && activity.enrollments.length > 0 && (
          <div className="mt-9">
            <Eyebrow className="mb-4">Automations</Eyebrow>
            <ul className="flex flex-col gap-2">
              {activity.enrollments.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-soft px-4 py-3 text-[13px]">
                  <span className="truncate">{e.automation}</span>
                  <span className="shrink-0 text-neutral-500">{e.status === "ACTIVE" ? "In progress" : e.stopReason ?? (e.status === "COMPLETED" ? "Finished" : "Stopped")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {dialog}
    </Drawer>
  );
}

