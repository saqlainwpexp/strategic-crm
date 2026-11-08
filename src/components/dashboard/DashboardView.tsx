"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Button, buttonClass } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { FilterSelect } from "@/components/ui/Form";
import { PaymentModal } from "@/components/shared/PaymentModal";
import { AnalyticsTab } from "@/components/reports/AnalyticsTab";
import { SalesActivityTab } from "@/components/reports/SalesActivityTab";
import { RANGE_OPTIONS, useReportReps, type ReportRange } from "@/components/reports/useReport";
import { PerformanceCard } from "./PerformanceCard";
import { UpcomingSchedule } from "./UpcomingSchedule";
import { IntelligentBox } from "./IntelligentBox";
import { ActiveLeadsTable } from "./ActiveLeadsTable";
import { formatToday, greetingFor, zonedParts } from "@/lib/date";
import { formatHours } from "@/lib/utils";

type Tab = "overview" | "analytics" | "sales" | "social";
const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "analytics", label: "Analytics" },
  { value: "sales", label: "Sales & Activity" },
];

export function DashboardView() {
  const { viewer } = useCrm();
  const { branding } = useBranding();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const reps = useReportReps();
  // The bar header already shows an Add lead action.
  const classic = branding.headerStyle === "classic";
  const { hour } = zonedParts();

  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "analytics" || tabParam === "sales" ? tabParam : "overview";
  const setTab = useCallback(
    (t: Tab) => router.replace(t === "overview" ? pathname : `${pathname}?tab=${t}`, { scroll: false }),
    [router, pathname]
  );
  const [range, setRange] = useState<ReportRange>("7d");
  const [repId, setRepId] = useState("");
  const [recording, setRecording] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-6 pb-8 pt-6">
        <h1 className="text-[34px] font-normal leading-tight tracking-[-0.025em] md:text-[42px]">
          {greetingFor(hour)}, {viewer.name.split(" ")[0]}!
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          {(viewer.role === "SALES" || viewer.role === "BD") && <ShiftPill />}
          {classic && (
            <>
              <span className="flex h-12 items-center gap-2.5 rounded-full border border-black/[0.06] bg-white px-5 text-[14px] text-ink">
                <CalendarDays className="h-4 w-4" strokeWidth={1.7} />
                {formatToday()}
              </span>
              <Link href="/leads?new=1" className={buttonClass("primary", "lg")}>
                <Plus className="h-4 w-4" strokeWidth={1.8} />
                Add New Lead
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs + report controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Segmented value={tab} onChange={setTab} options={TABS} className="border border-black/[0.06] bg-white" />
        {tab !== "overview" && (
          <div className="flex flex-wrap items-center gap-3">
            {reps.length > 1 && (
              <FilterSelect value={repId} onChange={(e) => setRepId(e.target.value)} active={!!repId} onPage>
                <option value="">{viewer.role === "BD" ? "My team" : "Whole team"}</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </FilterSelect>
            )}
            <Segmented value={range} onChange={setRange} options={RANGE_OPTIONS} className="border border-black/[0.06] bg-white" />
            {tab === "sales" && (
              <Button size="lg" onClick={() => setRecording(true)}>
                <Plus className="h-4 w-4" /> Record payment
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.58fr_1fr]">
            <PerformanceCard />
            <UpcomingSchedule />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:h-[470px] lg:grid-cols-[1fr_1.76fr]">
            <IntelligentBox />
            <ActiveLeadsTable />
          </div>
        </>
      )}
      {tab === "analytics" && <AnalyticsTab range={range} repId={repId} />}
      {tab === "sales" && <SalesActivityTab range={range} repId={repId} />}

      <PaymentModal open={recording} onClose={() => setRecording(false)} />
    </div>
  );
}

export function ShiftPill() {
  const { activeShift, clockIn, clockOut } = useCrm();
  const shift = activeShift();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!shift) {
    return (
      <button onClick={clockIn} className={buttonClass("brand", "lg")}>
        Clock in
      </button>
    );
  }
  const elapsed = now ? Math.max(0, Math.round((now - new Date(shift.clockIn).getTime()) / 1000)) : 0;
  return (
    <span className="flex h-12 items-center gap-3 rounded-full border border-black/[0.06] bg-white pl-5 pr-1.5 text-[14px]">
      <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
      On shift <span className="tabular-nums text-neutral-500">{now ? formatHours(elapsed) : ""}</span>
      <button onClick={clockOut} className="h-9 rounded-full bg-page px-4 text-[13px] transition-colors hover:bg-ink hover:text-white">
        Clock out
      </button>
    </span>
  );
}
