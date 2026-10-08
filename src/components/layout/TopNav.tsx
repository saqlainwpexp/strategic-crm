"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowRight,
  Bell,
  BellRing,
  CalendarDays,
  CalendarPlus,
  ChartColumn,
  Check,
  ChevronDown,
  Clock,
  Columns3,
  FileText,
  LayoutGrid,
  ListOrdered,
  Moon,
  PhoneCall,
  Search,
  Settings2,
  Sun,
  Upload,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn, formatHours } from "@/lib/utils";
import { HOME_PATH, NAV_ITEMS, navFor, type NavKey } from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/constants";
import { dayKey, formatTime, relativeTime, todayKey } from "@/lib/date";
import { upcomingFor } from "@/lib/queue";
import { setViewAs } from "@/app/actions";
import { useCrm } from "@/components/providers/CrmProvider";
import { useBranding } from "@/components/providers/BrandingProvider";
import { Avatar } from "@/components/ui/Avatar";
import { LeadThumb } from "@/components/ui/LeadThumb";
import { MeetingModal } from "@/components/shared/MeetingModal";
import { PaymentModal } from "@/components/shared/PaymentModal";
import { BrandMark, Logo } from "./Logo";

const NAV_ICONS: Record<NavKey, LucideIcon> = {
  loadboard: ListOrdered,
  dashboard: LayoutGrid,
  leads: Users,
  pipeline: Columns3,
  schedule: CalendarDays,
  team: UsersRound,
  scripts: FileText,
  admin: Settings2,
};

/** Header stays pinned while the page scrolls; content slides under a frosted page-coloured backdrop. */
const STICKY = "sticky top-0 z-40 bg-page/85 backdrop-blur-md";

type Variant = "bar" | "classic";
type Menu = null | "pages" | "more" | "search" | "bell" | "user" | "create";

const panel =
  "animate-pop-in absolute top-[calc(100%+12px)] z-40 rounded-[20px] bg-white p-2 text-ink shadow-[0_24px_64px_-12px_rgba(10,10,10,0.25),0_0_0_1px_rgba(10,10,10,0.05)]";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function useMenus() {
  const pathname = usePathname();
  const [open, setOpen] = useState<Menu>(null);
  useEffect(() => setOpen(null), [pathname]);
  return {
    open,
    close: () => setOpen(null),
    toggle: (k: NonNullable<Menu>) => setOpen((o) => (o === k ? null : k)),
  };
}

export function TopNav() {
  const { branding } = useBranding();
  return branding.headerStyle === "classic" ? <ClassicHeader /> : <BarHeader />;
}

// ─── Bar header (white-label default) ────────────────────────

/** Translucent rounded tile on the coloured bar. */
const tile =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-header-fg/[0.12] px-4 text-[15px] font-medium text-header-fg transition-colors hover:bg-header-fg/[0.2]";

function BarHeader() {
  const { branding } = useBranding();
  const { open, close, toggle } = useMenus();

  return (
    <header className={STICKY}>
      <div className="mx-auto max-w-[1440px] px-6 pb-3 pt-5 lg:px-10">
      <div className="flex h-[68px] items-center gap-2 rounded-[22px] bg-header px-3 text-header-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07),0_1px_2px_rgba(10,10,10,0.08)]">
        <Link href={HOME_PATH} className="flex shrink-0 items-center gap-3 pr-1" aria-label={`${branding.appName} home`}>
          <span className={cn(tile, "w-11 justify-center px-0")}>
            <BrandMark className="h-6 w-6 text-header-fg" imgClassName="h-6 max-w-[30px]" />
          </span>
          {branding.showNameInHeader && (
            <span className="hidden text-[16px] font-semibold tracking-[-0.01em] sm:inline">{branding.appName}</span>
          )}
        </Link>

        <BarNav open={open === "more"} onToggle={() => toggle("more")} onClose={close} />
        <div className="xl:hidden">
          <PageSwitcher open={open === "pages"} onToggle={() => toggle("pages")} onClose={close} />
        </div>
        <span className="mx-1.5 hidden h-6 w-px bg-header-fg/25 xl:block" />
        <SearchButton variant="bar" open={open === "search"} onToggle={() => toggle("search")} onClose={close} />
        <Link href="/leads?new=1" className={cn(tile, "hidden md:inline-flex")}>
          <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="hidden 2xl:inline">Add lead</span>
        </Link>
        <span className="mx-1.5 hidden h-6 w-px bg-header-fg/25 md:block" />
        <BellButton variant="bar" open={open === "bell"} onToggle={() => toggle("bell")} onClose={close} />

        <div className="ml-auto flex items-center gap-2">
          <UserMenu variant="bar" open={open === "user"} onToggle={() => toggle("user")} onClose={close} />
          <CreateMenu open={open === "create"} onToggle={() => toggle("create")} onClose={close} />
        </div>
      </div>
      </div>
    </header>
  );
}

/** Classic-style tabs inside the bar: active page is a solid pill, the rest plain text. */
function BarNav({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const pathname = usePathname();
  const { viewer } = useCrm();
  const ref = useDismiss(open, onClose);
  const { primary, more } = navFor(viewer.role);
  const isActive = (k: NavKey) => pathname.startsWith(NAV_ITEMS[k].href);
  const link = "flex h-10 shrink-0 items-center gap-2 rounded-[12px] px-3.5 text-[14px] font-medium transition-colors";
  const on = "bg-header-fg text-header";
  const off = "text-header-fg/75 hover:bg-header-fg/[0.12] hover:text-header-fg";

  return (
    <nav className="ml-1 hidden items-center gap-0.5 xl:flex" aria-label="Main">
      {primary.map((k) => {
        const Icon = NAV_ICONS[k];
        const active = isActive(k);
        return (
          <Link key={k} href={NAV_ITEMS[k].href} className={cn(link, active ? on : off)} aria-current={active ? "page" : undefined}>
            {active && <Icon className="h-4 w-4" strokeWidth={2} />}
            {NAV_ITEMS[k].label}
          </Link>
        );
      })}
      {more.length > 0 && (
        <div ref={ref} className="relative">
          <button onClick={onToggle} aria-haspopup="menu" aria-expanded={open} className={cn(link, more.some(isActive) ? on : off)}>
            More
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className={cn(panel, "left-0 w-[220px]")} role="menu">
              {more.map((k) => (
                <MenuLink key={k} k={k} active={isActive(k)} />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

function PageSwitcher({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const pathname = usePathname();
  const { viewer } = useCrm();
  const ref = useDismiss(open, onClose);
  const { primary, more } = navFor(viewer.role);
  const all = [...primary, ...more];
  const current = all.find((k) => pathname.startsWith(NAV_ITEMS[k].href)) ?? "dashboard";
  const Icon = NAV_ICONS[current];

  return (
    <div ref={ref} className="relative">
      <button onClick={onToggle} className={cn(tile, open && "bg-header-fg/[0.22]")} aria-haspopup="menu" aria-expanded={open}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {NAV_ITEMS[current].label}
        <ChevronDown className={cn("h-4 w-4 opacity-80 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn(panel, "left-0 w-[280px] p-2.5")} role="menu">
          <p className="px-3 pb-2 pt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">Go to</p>
          <div className="grid grid-cols-1 gap-0.5">
            {all.map((k) => (
              <MenuLink key={k} k={k} active={k === current} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateMenu({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { perms } = useCrm();
  const router = useRouter();
  const ref = useDismiss(open, onClose);
  const [modal, setModal] = useState<null | "meeting" | "payment">(null);

  const items: { icon: LucideIcon; label: string; hint: string; run: () => void }[] = [
    { icon: UserPlus, label: "New lead", hint: "Add a lead by hand", run: () => router.push("/leads?new=1") },
    { icon: CalendarPlus, label: "Book meeting", hint: "Schedule with a lead", run: () => setModal("meeting") },
    { icon: Wallet, label: "Record payment", hint: "Advance or invoice", run: () => setModal("payment") },
    ...(perms.importLeads
      ? [{ icon: Upload, label: "Import leads", hint: "Upload a CSV file", run: () => router.push("/leads?import=1") }]
      : []),
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-[16px] bg-header-cta px-5 text-[15px] font-medium text-header-cta-fg shadow-sm transition-opacity hover:opacity-90 sm:px-7"
      >
        Create
        <ArrowRight className={cn("h-4 w-4 transition-transform", open && "rotate-90")} strokeWidth={2} />
      </button>
      {open && (
        <div className={cn(panel, "right-0 w-[280px] p-2.5")} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              onClick={() => {
                onClose();
                it.run();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page">
                <it.icon className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span>
                <span className="block text-[14px]">{it.label}</span>
                <span className="block text-[12px] text-neutral-500">{it.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <MeetingModal open={modal === "meeting"} onClose={() => setModal(null)} />
      <PaymentModal open={modal === "payment"} onClose={() => setModal(null)} />
    </div>
  );
}

// ─── Classic header ──────────────────────────────────────────

function ClassicHeader() {
  const pathname = usePathname();
  const { viewer } = useCrm();
  const { primary, more } = navFor(viewer.role);
  const { open, close, toggle } = useMenus();
  const moreRef = useDismiss(open === "more", close);
  const mobileRef = useDismiss(open === "pages", close);
  const isActive = (k: NavKey) => pathname.startsWith(NAV_ITEMS[k].href);

  return (
    <header className={STICKY}>
      <div className="mx-auto flex h-20 max-w-[1440px] items-center px-6 lg:px-10">
      <Link href={HOME_PATH} className="shrink-0">
        <Logo />
      </Link>

      <nav className="ml-12 hidden items-center gap-1 xl:flex">
        {primary.map((k) => (
          <NavLink key={k} k={k} active={isActive(k)} />
        ))}
        {more.length > 0 && (
          <div ref={moreRef} className="relative">
            <button
              onClick={() => toggle("more")}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full px-4 text-[13.5px] transition-colors",
                more.some(isActive) ? "bg-ink text-white" : "text-neutral-700 hover:text-ink"
              )}
            >
              More
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {open === "more" && (
              <div className={cn(panel, "left-0 w-[220px]")}>
                {more.map((k) => (
                  <MenuLink key={k} k={k} active={isActive(k)} />
                ))}
              </div>
            )}
          </div>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <SearchButton variant="classic" open={open === "search"} onToggle={() => toggle("search")} onClose={close} />
        <BellButton variant="classic" open={open === "bell"} onToggle={() => toggle("bell")} onClose={close} />
        <ThemePill />
        <UserMenu variant="classic" open={open === "user"} onToggle={() => toggle("user")} onClose={close} />
        <div ref={mobileRef} className="relative xl:hidden">
          <CircleBtn label="Menu" onClick={() => toggle("pages")}>
            <LayoutGrid className="h-[17px] w-[17px]" strokeWidth={1.8} />
          </CircleBtn>
          {open === "pages" && (
            <div className={cn(panel, "right-0 w-[240px]")}>
              {[...primary, ...more].map((k) => (
                <MenuLink key={k} k={k} active={isActive(k)} />
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}

function NavLink({ k, active }: { k: NavKey; active: boolean }) {
  const Icon = NAV_ICONS[k];
  return (
    <Link
      href={NAV_ITEMS[k].href}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors",
        active ? "bg-ink text-white" : "text-neutral-700 hover:text-ink"
      )}
    >
      {active && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
      {NAV_ITEMS[k].label}
    </Link>
  );
}

function MenuLink({ k, active }: { k: NavKey; active: boolean }) {
  const Icon = NAV_ICONS[k];
  return (
    <Link
      href={NAV_ITEMS[k].href}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3.5 text-[14px] transition-colors",
        active ? "bg-ink text-white" : "text-ink hover:bg-page"
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
      {NAV_ITEMS[k].label}
    </Link>
  );
}

function CircleBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "relative grid h-11 w-11 place-items-center rounded-full border border-black/[0.06] transition-colors",
        active ? "bg-ink text-white" : "bg-white text-ink hover:bg-neutral-50"
      )}
    >
      {children}
    </button>
  );
}

function ThemePill() {
  const { notify } = useCrm();
  return (
    <div className="hidden h-11 items-center rounded-full border border-black/[0.06] bg-white px-1 sm:flex">
      <button aria-label="Light mode" title="Light mode" className="grid h-9 w-9 place-items-center rounded-full text-ink">
        <Sun className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </button>
      <button
        aria-label="Dark mode"
        title="Dark mode"
        onClick={() => notify("Dark mode is coming in a later update")}
        className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:text-ink"
      >
        <Moon className="h-[17px] w-[17px]" strokeWidth={1.8} />
      </button>
    </div>
  );
}

// ─── Shared dropdowns ────────────────────────────────────────

type DropdownProps = { variant: Variant; open: boolean; onToggle: () => void; onClose: () => void };

function SearchButton({ variant, open, onToggle, onClose }: DropdownProps) {
  const { data } = useCrm();
  const router = useRouter();
  const ref = useDismiss(open, onClose);
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const digits = term.replace(/\D/g, "");
    return data.leads
      .filter(
        (l) =>
          l.businessName.toLowerCase().includes(term) ||
          l.decisionMakerName.toLowerCase().includes(term) ||
          (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits))
      )
      .slice(0, 7);
  }, [q, data.leads]);

  return (
    <div ref={ref} className="relative">
      {variant === "bar" ? (
        <button onClick={onToggle} className={cn(tile, open && "bg-header-fg/[0.22]")} aria-label="Search leads">
          <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
          <span className="hidden 2xl:inline">Search</span>
        </button>
      ) : (
        <CircleBtn label="Search leads" onClick={onToggle} active={open}>
          <Search className="h-[17px] w-[17px]" strokeWidth={1.8} />
        </CircleBtn>
      )}
      {open && (
        <div className={cn(panel, variant === "bar" ? "left-0" : "right-0", "w-[min(400px,calc(100vw-48px))] p-3")}>
          <label className="flex h-11 items-center gap-2.5 rounded-xl bg-page px-4">
            <Search className="h-4 w-4 text-neutral-500" strokeWidth={1.8} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search business, owner or phone…"
              className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-neutral-500"
            />
          </label>
          <div className="mt-2">
            {q.trim().length < 2 ? (
              <p className="px-3 py-4 text-[13px] text-neutral-500">Type at least 2 characters.</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-[13px] text-neutral-500">No leads match “{q}”.</p>
            ) : (
              results.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    onClose();
                    setQ("");
                    router.push(`/leads?lead=${l.id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page"
                >
                  <LeadThumb lead={l} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{l.businessName}</span>
                    <span className="block truncate text-[12px] text-neutral-500">
                      {l.decisionMakerName} · {l.phone}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellButton({ variant, open, onToggle, onClose }: DropdownProps) {
  const { data, viewer, perms } = useCrm();
  const router = useRouter();
  const ref = useDismiss(open, onClose);

  const items = useMemo(() => {
    const today = todayKey();
    const now = new Date().toISOString();
    const mine = (userId: string | null) => perms.seesTeam || userId === viewer.id;
    const out: { id: string; icon: LucideIcon; title: string; body: string; href: string }[] = [];

    // Your own follow-ups and meetings inside the reminder window come first.
    const soonMs = data.settings.reminderMinutes * 60 * 1000;
    const t = Date.now();
    for (const it of upcomingFor(data, { ownerId: viewer.id, now: t, days: 1 })
      .filter((x) => new Date(x.at).getTime() - t <= soonMs)
      .slice(0, 3)) {
      out.push({
        id: `soon_${it.id}`,
        icon: BellRing,
        title: `${it.title} at ${formatTime(it.at)}`,
        body: `${it.lead.businessName} · ${relativeTime(it.at, t)}`,
        href: `/leads?lead=${it.lead.id}`,
      });
    }

    const overdue = data.leads.filter(
      (l) => l.nextFollowUpAt && l.nextFollowUpAt < now && mine(l.assignedToId) && l.stage !== "CLOSED_WON" && l.stage !== "NOT_INTERESTED"
    );
    if (overdue.length)
      out.push({
        id: "overdue",
        icon: PhoneCall,
        title: `${overdue.length} overdue follow-up${overdue.length > 1 ? "s" : ""}`,
        body: overdue.slice(0, 2).map((l) => l.businessName).join(", ") + (overdue.length > 2 ? "…" : ""),
        href: "/leads?view=due",
      });

    const meetingsToday = data.meetings.filter((m) => m.status === "BOOKED" && dayKey(m.scheduledAt) === today);
    for (const m of meetingsToday.slice(0, 3)) {
      const lead = data.leads.find((l) => l.id === m.leadId);
      out.push({ id: m.id, icon: CalendarDays, title: `${m.title} at ${formatTime(m.scheduledAt)}`, body: lead?.businessName ?? "", href: "/schedule" });
    }

    const latePayments = data.payments.filter((p) => p.status === "PENDING" && p.dueDate < now);
    if (latePayments.length)
      out.push({
        id: "late",
        icon: Wallet,
        title: `${latePayments.length} payment${latePayments.length > 1 ? "s" : ""} past due`,
        body: "Follow up on outstanding invoices",
        href: "/dashboard?tab=sales",
      });
    return out;
  }, [data, viewer.id, perms.seesTeam]);

  const badge = items.length > 0 && (
    <span className="absolute right-[7px] top-[6px] grid h-[16px] min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9.5px] font-semibold leading-none text-brand-fg ring-2 ring-header">
      {items.length}
    </span>
  );

  return (
    <div ref={ref} className="relative">
      {variant === "bar" ? (
        <button onClick={onToggle} aria-label="Notifications" className={cn(tile, "relative w-11 justify-center px-0", open && "bg-header-fg/[0.22]")}>
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.8} />
          {badge}
        </button>
      ) : (
        <CircleBtn label="Notifications" onClick={onToggle} active={open}>
          <Bell className="h-[17px] w-[17px]" strokeWidth={1.8} />
          {items.length > 0 && (
            <span className="absolute right-[8px] top-[7px] grid h-[15px] min-w-[15px] place-items-center rounded-full bg-brand px-1 text-[9px] font-semibold leading-none text-brand-fg">
              {items.length}
            </span>
          )}
        </CircleBtn>
      )}
      {open && (
        <div className={cn(panel, variant === "bar" ? "left-0" : "right-0", "w-[min(360px,calc(100vw-48px))] p-3")}>
          <p className="px-3 pb-2 pt-2 text-[13px] font-medium">Notifications</p>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-neutral-500">You're all caught up.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  onClose();
                  router.push(n.href);
                }}
                className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-page"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page">
                  <n.icon className="h-4 w-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{n.title}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-neutral-500">{n.body}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function UserMenu({ variant, open, onToggle, onClose }: DropdownProps) {
  const { viewer, allUsers, activeShift, clockIn, clockOut } = useCrm();
  const ref = useDismiss(open, onClose);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const now = useNow();
  const shift = activeShift();
  const onShiftFor = shift && now ? Math.max(0, Math.round((now - new Date(shift.clockIn).getTime()) / 1000)) : 0;

  return (
    <div ref={ref} className="relative">
      {variant === "bar" ? (
        <button
          onClick={onToggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex h-11 items-center gap-2.5 rounded-[14px] px-3 text-[15px] font-medium text-header-fg transition-colors hover:bg-header-fg/[0.12]"
        >
          <span className="relative">
            <Avatar name={viewer.name} size={28} />
            {shift && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#22C55E] ring-2 ring-header" />}
          </span>
          <span className="hidden md:inline">{viewer.name.split(" ")[0]}</span>
          <ChevronDown className="h-4 w-4 opacity-80" />
        </button>
      ) : (
        <button onClick={onToggle} className="flex h-11 items-center gap-1.5 rounded-full border border-black/[0.06] bg-white pl-1 pr-2.5">
          <span className="relative">
            <Avatar name={viewer.name} size={34} />
            {shift && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[#22C55E] ring-2 ring-white" />}
          </span>
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        </button>
      )}

      {open && (
        <div className={cn(panel, "right-0 w-[min(320px,calc(100vw-48px))] p-3")}>
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={viewer.name} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-medium">{viewer.name}</p>
              <p className="truncate text-[12.5px] text-neutral-500">{viewer.title}</p>
            </div>
          </div>

          <div className="mx-1 mt-1 rounded-2xl bg-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[13px] text-neutral-700">
                <Clock className="h-4 w-4" strokeWidth={1.8} />
                {shift ? (
                  <span>
                    On shift · <span className="tabular-nums text-ink">{formatHours(onShiftFor)}</span>
                  </span>
                ) : (
                  "Off shift"
                )}
              </span>
              <button
                onClick={shift ? clockOut : clockIn}
                className={cn(
                  "h-8 rounded-full px-3.5 text-[12.5px] transition-colors",
                  shift ? "border border-black/10 bg-white hover:bg-neutral-50" : "bg-ink text-white hover:bg-ink-muted"
                )}
              >
                {shift ? "Clock out" : "Clock in"}
              </button>
            </div>
            {shift && <p className="mt-2 text-[12px] text-neutral-500">Started at {formatTime(shift.clockIn)}</p>}
          </div>

          <p className="px-3 pb-2 pt-5 text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">Preview as · demo</p>
          {allUsers.map((u) => (
            <button
              key={u.id}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setViewAs(u.id);
                  onClose();
                  router.push(HOME_PATH);
                  router.refresh();
                })
              }
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page disabled:opacity-60"
            >
              <Avatar name={u.name} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px]">{u.name}</span>
                <span className="block truncate text-[11.5px] text-neutral-500">{ROLE_LABELS[u.role]}</span>
              </span>
              {u.id === viewer.id && <Check className="h-4 w-4 text-brand" strokeWidth={2.2} />}
            </button>
          ))}
          <p className="px-3 pb-2 pt-3 text-[11.5px] leading-relaxed text-neutral-400">
            Real sign-in replaces this switcher once the database is connected.
          </p>
        </div>
      )}
    </div>
  );
}
