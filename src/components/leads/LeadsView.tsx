"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Flame, PhoneCall, PhoneOff, Plus, SearchX, Trash2, Upload, Users, AlarmClock } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { DeleteLeadsWarning } from "@/components/shared/DeleteLeadsWarning";
import { useCrm } from "@/components/providers/CrmProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader, StatCard, EmptyState } from "@/components/ui/Layout";
import { Segmented } from "@/components/ui/Segmented";
import { StatsToggle, useRememberedToggle } from "@/components/ui/StatsToggle";
import { Checkbox, FilterSelect, SearchInput } from "@/components/ui/Form";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { PriorityFlag, ScoreTag, StageLabel } from "@/components/ui/Badges";
import { UserChip } from "@/components/ui/Avatar";
import { LeadDrawer } from "./LeadDrawer";
import { LeadForm } from "./LeadForm";
import { CsvImportModal } from "./CsvImportModal";
import { SocialImportModal } from "@/components/outreach/SocialImportModal";
import {
  AGENCY_SERVICES,
  OPEN_STAGES,
  PIPELINE_STAGES,
  PRIORITIES,
  PRIORITY_LABELS,
  STAGE_LABELS,
} from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { dialHref } from "@/lib/dial";
import { dayKey, dayLabel, formatTime, zonedISO, todayKey } from "@/lib/date";
import { cn, compactMoney, groupBy } from "@/lib/utils";

type QuickView = "all" | "hot" | "due" | "untouched" | "mine";
type SortKey = "score" | "newest" | "followup" | "value" | "name";
const PAGE_SIZE = 25;

export function LeadsView() {
  const { data, viewer, perms, userById, tempOf, assignLeads, deleteLeads } = useCrm();
  const { confirm, dialog } = useConfirm();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [view, setView] = useState<QuickView>((params.get("view") as QuickView) || "all");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState(params.get("stage") ?? "");
  const [service, setService] = useState("");
  const [priority, setPriority] = useState("");
  const [source, setSource] = useState("");
  const [rep, setRep] = useState(params.get("rep") ?? "");
  const [pool, setPool] = useState(params.get("pool") ?? "");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [socialImportOpen, setSocialImportOpen] = useState(false);
  const [statsOpen, toggleStats] = useRememberedToggle("scrm_stats_leads");

  const openId = params.get("lead");
  const startCall = params.get("call") === "1";

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) (v === null ? p.delete(k) : p.set(k, v));
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // "Add New Lead" from the dashboard links here with ?new=1
  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setFormOpen(true);
      setParams({ new: null });
    }
    // "Import leads" from the header's Create menu
    if (params.get("import") === "1") {
      if (perms.importLeads) setImportOpen(true);
      setParams({ import: null });
    }
  }, [params, setParams, perms.importLeads]);

  // ── Derived data ──
  const callCounts = useMemo(() => {
    const g = groupBy(data.calls, (c) => c.leadId);
    return new Map(Object.entries(g).map(([k, v]) => [k, v.length]));
  }, [data.calls]);

  const endOfToday = zonedISO(todayKey(), 23, 59);
  const isHot = useCallback((l: Lead) => tempOf(l.leadScore) === "HOT" && OPEN_STAGES.includes(l.stage), [tempOf]);
  const isDue = useCallback(
    (l: Lead) => !!l.nextFollowUpAt && l.nextFollowUpAt <= endOfToday && OPEN_STAGES.includes(l.stage),
    [endOfToday]
  );
  const isUntouched = useCallback((l: Lead) => l.stage === "LEAD" && !callCounts.get(l.id), [callCounts]);

  const counts = useMemo(
    () => ({
      all: data.leads.length,
      hot: data.leads.filter(isHot).length,
      due: data.leads.filter(isDue).length,
      overdue: data.leads.filter((l) => isDue(l) && l.nextFollowUpAt! < new Date().toISOString()).length,
      untouched: data.leads.filter(isUntouched).length,
      mine: data.leads.filter((l) => l.assignedToId === viewer.id).length,
      unassigned: data.leads.filter((l) => !l.assignedToId).length,
      open: data.leads.filter((l) => OPEN_STAGES.includes(l.stage)).length,
    }),
    [data.leads, isHot, isDue, isUntouched, viewer.id]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    const list = data.leads.filter((l) => {
      if (view === "hot" && !isHot(l)) return false;
      if (view === "due" && !isDue(l)) return false;
      if (view === "untouched" && !isUntouched(l)) return false;
      if (view === "mine" && l.assignedToId !== viewer.id) return false;
      if (stage && l.stage !== stage) return false;
      if (service && l.service !== service) return false;
      if (priority && l.priority !== priority) return false;
      if (source && l.source !== source) return false;
      if (rep && (rep === "__none" ? l.assignedToId !== null : l.assignedToId !== rep)) return false;
      if (pool && l.poolId !== pool) return false;
      if (city && l.city !== city) return false;
      if (term) {
        const hit =
          l.businessName.toLowerCase().includes(term) ||
          l.decisionMakerName.toLowerCase().includes(term) ||
          l.email.toLowerCase().includes(term) ||
          l.city.toLowerCase().includes(term) ||
          (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits));
        if (!hit) return false;
      }
      return true;
    });
    const by: Record<SortKey, (a: Lead, b: Lead) => number> = {
      score: (a, b) => b.leadScore - a.leadScore,
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      followup: (a, b) => (a.nextFollowUpAt ?? "9999").localeCompare(b.nextFollowUpAt ?? "9999"),
      value: (a, b) => b.estimatedValue - a.estimatedValue,
      name: (a, b) => a.businessName.localeCompare(b.businessName),
    };
    return list.sort(by[sort]);
  }, [data.leads, view, stage, service, priority, source, rep, pool, city, q, sort, isHot, isDue, isUntouched, viewer.id]);

  useEffect(() => setPage(1), [view, stage, service, priority, source, rep, pool, city, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reps = data.users.filter((u) => u.role === "SALES" || u.role === "BD");
  const sources = useMemo(() => [...new Set(data.leads.map((l) => l.source))].sort(), [data.leads]);
  const cities = useMemo(() => [...new Set(data.leads.map((l) => l.city).filter(Boolean))].sort(), [data.leads]);
  const anyFilter = !!(stage || service || priority || source || rep || pool || city || q || view !== "all");
  const clearFilters = () => {
    setView("all");
    setStage("");
    setService("");
    setPriority("");
    setSource("");
    setRep("");
    setPool("");
    setCity("");
    setQ("");
  };

  const pageIds = pageRows.map((l) => l.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const subtitle =
    viewer.role === "SALES"
      ? "Your assigned leads — call, log outcomes and book meetings."
      : viewer.role === "BD"
        ? "Your leads and your team's, in one loadboard."
        : "Every lead across the agency.";

  const views: { value: QuickView; label: string; count: number }[] = [
    { value: "all", label: "All", count: counts.all },
    { value: "hot", label: "Hot", count: counts.hot },
    { value: "due", label: "Due today", count: counts.due },
    { value: "untouched", label: "Untouched", count: counts.untouched },
    ...(viewer.role === "BD" ? [{ value: "mine" as const, label: "Mine", count: counts.mine }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle={subtitle}
        actions={
          <>
            <StatsToggle open={statsOpen} onToggle={toggleStats} label="Lead stats" />
            {perms.importLeads && (
              <Button variant="secondary" size="lg" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
            )}
            {(perms.importLeads || viewer.role === "BD") && (
              <Button variant="secondary" size="lg" onClick={() => setSocialImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import social CSV
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add lead
            </Button>
          </>
        }
      />

      {/* Stats (collapsed by default) */}
      {statsOpen && (
      <div className="animate-fade-in mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total leads"
          value={counts.all.toLocaleString("en-US")}
          hint={perms.assignLeads ? `${counts.unassigned} unassigned in pools` : `${counts.open} still open`}
          onClick={() => setView("all")}
          active={view === "all" && !anyFilter}
        />
        <StatCard icon={Flame} label="Hot leads" value={counts.hot} hint="Score 75+ and still open" onClick={() => setView("hot")} active={view === "hot"} />
        <StatCard
          icon={AlarmClock}
          label="Follow-ups due"
          value={counts.due}
          hint={counts.overdue ? `${counts.overdue} overdue` : "Nothing overdue"}
          onClick={() => setView("due")}
          active={view === "due"}
        />
        <StatCard icon={PhoneOff} label="Untouched" value={counts.untouched} hint="Never called yet" onClick={() => setView("untouched")} active={view === "untouched"} />
      </div>
      )}

      {/* Filters */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business, owner, phone, email or city"
            className="h-11 w-full md:w-[380px]"
          />
          <Segmented options={views} value={view} onChange={setView} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <FilterSelect value={stage} onChange={(e) => setStage(e.target.value)} active={!!stage}>
            <option value="">All stages</option>
            {PIPELINE_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={service} onChange={(e) => setService(e.target.value)} active={!!service}>
            <option value="">All services</option>
            {AGENCY_SERVICES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </FilterSelect>
          <FilterSelect value={priority} onChange={(e) => setPriority(e.target.value)} active={!!priority}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]} priority
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={source} onChange={(e) => setSource(e.target.value)} active={!!source}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </FilterSelect>
          {perms.seesTeam && (
            <FilterSelect value={rep} onChange={(e) => setRep(e.target.value)} active={!!rep}>
              <option value="">All reps</option>
              {reps.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {perms.assignLeads && viewer.role !== "BD" && <option value="__none">Unassigned</option>}
            </FilterSelect>
          )}
          <FilterSelect value={pool} onChange={(e) => setPool(e.target.value)} active={!!pool}>
            <option value="">All pools</option>
            {data.pools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={city} onChange={(e) => setCity(e.target.value)} active={!!city}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </FilterSelect>
          {anyFilter && (
            <Button variant="link" size="sm" onClick={clearFilters} className="ml-1 text-[13px]">
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Table */}
      <Card className="mt-6 p-0">
        <div className="flex flex-wrap items-center justify-between gap-4 px-7 pb-5 pt-6">
          {perms.assignLeads && selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-full bg-ink py-1.5 pl-5 pr-1.5 text-white">
              <span className="text-[13px]">{selected.size} selected</span>
              <BulkSelect
                label="Assign to"
                onPick={(v) => {
                  assignLeads([...selected], { assignedToId: v === "__none" ? null : v });
                  setSelected(new Set());
                }}
                options={[...reps.map((u) => ({ value: u.id, label: u.name })), { value: "__none", label: "Unassigned" }]}
              />
              <BulkSelect
                label="Move to pool"
                onPick={(v) => {
                  assignLeads([...selected], { poolId: v });
                  setSelected(new Set());
                }}
                options={data.pools.map((p) => ({ value: p.id, label: p.name }))}
              />
              {perms.deleteLeads && (
                <button
                  onClick={() => {
                    const ids = [...selected];
                    confirm({
                      title: `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}?`,
                      body: <DeleteLeadsWarning count={ids.length} />,
                      confirmLabel: `Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}`,
                      danger: true,
                      run: () => {
                        deleteLeads(ids);
                        setSelected(new Set());
                      },
                    });
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-rose-500/90 px-3.5 text-[12.5px] text-white transition-colors hover:bg-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              <button onClick={() => setSelected(new Set())} className="h-8 rounded-full px-3 text-[12.5px] text-white/70 hover:text-white">
                Clear
              </button>
            </div>
          ) : (
            <h2 className="text-[18px] font-medium tracking-[-0.01em]">
              {filtered.length.toLocaleString("en-US")} lead{filtered.length === 1 ? "" : "s"}
            </h2>
          )}
          <div className="flex items-center gap-2 text-[13px] text-neutral-500">
            Sort by
            <FilterSelect value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="score">Lead score</option>
              <option value="followup">Next follow-up</option>
              <option value="newest">Newest first</option>
              <option value="value">Estimated value</option>
              <option value="name">Name A–Z</option>
            </FilterSelect>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No leads match these filters"
            body="Try removing a filter or searching for something else."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
            className="pb-16"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] border-collapse">
              <thead>
                <tr className="text-left text-[12.5px] text-neutral-700">
                  {perms.assignLeads && (
                    <th className="w-[52px] border-y border-neutral-100 py-3.5 pl-7 font-normal">
                      <Checkbox
                        label="Select page"
                        checked={allOnPage}
                        indeterminate={!allOnPage && someOnPage}
                        onChange={(on) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            pageIds.forEach((id) => (on ? n.add(id) : n.delete(id)));
                            return n;
                          })
                        }
                      />
                    </th>
                  )}
                  {["Business", "Decision maker", "Service", "Score", "Priority", "Stage", perms.seesTeam ? "Rep" : null, "Next follow-up", "Calls", ""].map(
                    (h, i) =>
                      h !== null && (
                        <th
                          key={i}
                          className={cn(
                            "border-y border-neutral-100 py-3.5 pr-4 font-normal",
                            i === 0 && !perms.assignLeads && "pl-7"
                          )}
                        >
                          {h}
                        </th>
                      )
                  )}
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {pageRows.map((l) => {
                  const overdue = l.nextFollowUpAt && l.nextFollowUpAt < new Date().toISOString() && OPEN_STAGES.includes(l.stage);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setParams({ lead: l.id, call: null })}
                      className={cn(
                        "cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/80",
                        selected.has(l.id) && "bg-brand-50/50"
                      )}
                    >
                      {perms.assignLeads && (
                        <td className="py-4 pl-7">
                          <Checkbox label={`Select ${l.businessName}`} checked={selected.has(l.id)} onChange={(on) => toggle(l.id, on)} />
                        </td>
                      )}
                      <td className={cn("py-4 pr-4", !perms.assignLeads && "pl-7")}>
                        <div className="flex items-center gap-3">
                          <LeadThumb lead={l} />
                          <div className="min-w-0">
                            <p className="max-w-[230px] truncate font-medium text-ink">{l.businessName}</p>
                            <p className="mt-0.5 max-w-[230px] truncate text-[11.5px] text-neutral-500">{l.address}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <p className="max-w-[170px] truncate text-ink">{l.decisionMakerName || "—"}</p>
                        <p className="mt-0.5 text-[11.5px] tabular-nums text-neutral-500">{l.phone}</p>
                      </td>
                      <td className="whitespace-nowrap py-4 pr-4 text-ink">
                        {l.service}
                        <p className="mt-0.5 text-[11.5px] text-neutral-500">{compactMoney(l.estimatedValue)}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <ScoreTag score={l.leadScore} temp={tempOf(l.leadScore)} />
                      </td>
                      <td className="py-4 pr-4">
                        <PriorityFlag priority={l.priority} />
                      </td>
                      <td className="py-4 pr-4">
                        <StageLabel stage={l.stage} />
                      </td>
                      {perms.seesTeam && (
                        <td className="py-4 pr-4">
                          {userById(l.assignedToId) ? (
                            <UserChip name={userById(l.assignedToId)!.name} />
                          ) : (
                            <span className="text-neutral-400">Unassigned</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap py-4 pr-4">
                        {l.nextFollowUpAt ? (
                          <span className={cn(overdue ? "text-[#E5484D]" : "text-ink")}>
                            {dayLabel(dayKey(l.nextFollowUpAt))}
                            <span className={cn("mt-0.5 block text-[11.5px]", overdue ? "text-[#E5484D]/80" : "text-neutral-500")}>
                              {formatTime(l.nextFollowUpAt)}
                              {overdue && " · overdue"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-4 pr-4 tabular-nums text-ink">{callCounts.get(l.id) ?? 0}</td>
                      <td className="py-4 pr-7 text-right">
                        <a
                          href={dialHref(l.phone, data.settings.dialerScheme)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setParams({ lead: l.id, call: "1" });
                          }}
                          aria-label={`Call ${l.businessName}`}
                          title={`Call ${l.phone}`}
                          className="inline-grid h-10 w-10 place-items-center rounded-full bg-brand text-brand-fg transition-transform hover:scale-105"
                        >
                          <PhoneCall className="h-4 w-4" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-neutral-100 px-7 py-5">
            <p className="text-[13px] text-neutral-500">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString("en-US")}
            </p>
            <div className="flex items-center gap-2">
              <PageBtn label="Previous page" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </PageBtn>
              {pageNumbers(page, pages).map((n, i) =>
                n === "…" ? (
                  <span key={`gap${i}`} className="px-1 text-neutral-400">
                    …
                  </span>
                ) : (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={cn(
                      "h-10 min-w-10 rounded-full px-3 text-[13px] tabular-nums transition-colors",
                      n === page ? "bg-ink text-white" : "bg-page text-ink hover:bg-neutral-200"
                    )}
                  >
                    {n}
                  </button>
                )
              )}
              <PageBtn label="Next page" disabled={page === pages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </PageBtn>
            </div>
          </div>
        )}
      </Card>

      <LeadDrawer
        leadId={openId}
        startCall={startCall}
        onClose={() => setParams({ lead: null, call: null })}
        onEdit={(lead) => {
          setEditing(lead);
          setFormOpen(true);
        }}
      />
      <LeadForm open={formOpen} onClose={() => setFormOpen(false)} lead={editing} />
      {dialog}
      <SocialImportModal open={socialImportOpen} onClose={() => setSocialImportOpen(false)} />
      {perms.importLeads && (
        <CsvImportModal
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={(poolId) => {
            clearFilters();
            setSort("newest");
            if (poolId) setPool(poolId);
          }}
        />
      )}
    </div>
  );
}

function BulkSelect({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { value: string; label: string }[];
  onPick: (v: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onPick(e.target.value)}
      className="h-8 cursor-pointer appearance-none rounded-full bg-white/10 px-4 text-[12.5px] text-white outline-none hover:bg-white/20"
    >
      <option value="" disabled>
        {label}…
      </option>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-ink">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function PageBtn({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-10 w-10 place-items-center rounded-full bg-page text-ink transition-colors hover:bg-neutral-200 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function pageNumbers(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < pages - 1) out.push("…");
  out.push(pages);
  return out;
}
