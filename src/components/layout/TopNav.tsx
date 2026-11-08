"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  ArrowRight,
  AtSign,
  Bell,
  BellRing,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  Contact,
  KeyRound,
  LogOut,
  Columns3,
  FileText,
  Inbox,
  LayoutGrid,
  LayoutTemplate,
  Linkedin,
  Briefcase,
  CalendarClock,
  NotebookPen,
  MessagesSquare,
  ListOrdered,
  Mail,
  MailPlus,
  MessageSquarePlus,
  Moon,
  PhoneCall,
  Search,
  Send,
  Settings2,
  Sun,
  Upload,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn, formatHours } from "@/lib/utils";
import {
  EMAIL_HOME,
  EMAIL_NAV,
  EMAIL_NAV_ORDER,
  HOME_PATH,
  LINKEDIN_HOME,
  LINKEDIN_NAV,
  LINKEDIN_NAV_ORDER,
  LOG_HOME,
  LOG_NAV,
  LOG_NAV_ORDER,
  type LogNavKey,
  NAV_ITEMS,
  modeFor,
  navFor,
  type AppMode,
  type EmailNavKey,
  type LinkedInNavKey,
  type NavKey,
} from "@/lib/nav";
import { ROLE_LABELS } from "@/lib/constants";
import { dayKey, formatTime, relativeTime, todayKey } from "@/lib/date";
import { upcomingFor } from "@/lib/queue";
import { ChangePasswordModal } from "@/components/shared/ChangePasswordModal";
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

const EMAIL_ICONS: Record<EmailNavKey, LucideIcon> = {
  overview: LayoutGrid,
  campaigns: Send,
  automations: Workflow,
  inbox: Inbox,
  contacts: Contact,
  templates: LayoutTemplate,
  sending: AtSign,
};

const LINKEDIN_ICONS: Record<LinkedInNavKey, LucideIcon> = {
  overview: LayoutGrid,
  accounts: Users,
  campaigns: Send,
  prospects: Contact,
  inbox: Inbox,
  templates: LayoutTemplate,
};

const LOG_ICONS: Record<LogNavKey, LucideIcon> = {
  today: CalendarClock,
  outreach: MessagesSquare,
  jobs: Briefcase,
  accounts: Users,
};

/** Header stays pinned while the page scrolls; content slides under a frosted page-coloured backdrop. */
const STICKY = "sticky top-0 z-40 bg-page/85 backdrop-blur-md";

type Variant = "bar" | "classic";
type Menu = null | "pages" | "more" | "search" | "bell" | "user" | "create" | "apps";

/** Unread email replies, shown on the Inbox tab and in the bell (managers only). */
const UnreadReplies = createContext(0);

type NavEntry = { key: string; label: string; href: string; icon: LucideIcon; exact?: boolean; badge?: number };

function useNav() {
  const pathname = usePathname();
  const { viewer, perms } = useCrm();
  const unread = useContext(UnreadReplies);
  const canSwitch = perms.emailMarketing || perms.linkedIn || perms.outreachLog;
  const mode: AppMode = canSwitch ? modeFor(pathname) : "calling";
  let primary: NavEntry[];
  let more: NavEntry[];
  if (mode === "email") {
    const entry = (k: EmailNavKey): NavEntry => ({ key: k, ...EMAIL_NAV[k], icon: EMAIL_ICONS[k], badge: k === "inbox" ? unread : undefined });
    primary = EMAIL_NAV_ORDER.primary.map(entry);
    more = EMAIL_NAV_ORDER.more.map(entry);
  } else if (mode === "linkedin") {
    const entry = (k: LinkedInNavKey): NavEntry => ({ key: k, ...LINKEDIN_NAV[k], icon: LINKEDIN_ICONS[k] });
    primary = LINKEDIN_NAV_ORDER.primary.map(entry);
    more = LINKEDIN_NAV_ORDER.more.map(entry);
  } else if (mode === "log") {
    const entry = (k: LogNavKey): NavEntry => ({ key: k, ...LOG_NAV[k], icon: LOG_ICONS[k] });
    primary = LOG_NAV_ORDER.primary.map(entry);
    more = LOG_NAV_ORDER.more.map(entry);
  } else {
    const { primary: p, more: m } = navFor(viewer.role);
    const entry = (k: NavKey): NavEntry => ({ key: k, ...NAV_ITEMS[k], icon: NAV_ICONS[k] });
    primary = p.map(entry);
    more = m.map(entry);
  }
  const home = mode === "email" ? EMAIL_HOME : mode === "linkedin" ? LINKEDIN_HOME : mode === "log" ? LOG_HOME : HOME_PATH;
  const isActive = (e: NavEntry) => (e.exact ? pathname === e.href : pathname === e.href || pathname.startsWith(`${e.href}/`));
  return { mode, home, primary, more, isActive, canSwitch };
}

function CountBadge({ n, onDark }: { n?: number; onDark?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums leading-none",
        onDark ? "bg-brand text-brand-fg" : "bg-brand text-brand-fg"
      )}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

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

export function TopNav({ unreadReplies = 0 }: { unreadReplies?: number }) {
  const { branding } = useBranding();
  return (
    <UnreadReplies.Provider value={unreadReplies}>
      {branding.headerStyle === "classic" ? <ClassicHeader /> : <BarHeader />}
    </UnreadReplies.Provider>
  );
}

// ─── App switcher (logo) ─────────────────────────────────────

const APPS: { mode: AppMode; label: string; hint: string; href: string; icon: LucideIcon; perm?: "emailMarketing" | "linkedIn" | "outreachLog" }[] = [
  { mode: "calling", label: "Cold Calling CRM", hint: "Loadboard, leads, pipeline & team", href: HOME_PATH, icon: PhoneCall },
  { mode: "email", label: "Email Marketing", hint: "Campaigns, automations & inbox", href: EMAIL_HOME, icon: Mail, perm: "emailMarketing" },
  { mode: "linkedin", label: "Strategic LinkedIn", hint: "Outreach campaigns & inbox", href: LINKEDIN_HOME, icon: Linkedin, perm: "linkedIn" },
  { mode: "log", label: "Outreach & Jobs Log", hint: "WhatsApp, email & DM outreach, job applications", href: LOG_HOME, icon: NotebookPen, perm: "outreachLog" },
];

function AppSwitcher({ variant, open, onToggle, onClose }: { variant: Variant; open: boolean; onToggle: () => void; onClose: () => void }) {
  const { branding } = useBranding();
  const { mode, home, canSwitch } = useNav();
  const { perms } = useCrm();
  const ref = useDismiss(open, onClose);
  const visibleApps = APPS.filter((a) => !a.perm || perms[a.perm]);
  const current = visibleApps.find((a) => a.mode === mode) ?? visibleApps[0]!;

  const mark =
    variant === "bar" ? (
      <>
        <span className={cn(tile, "w-11 justify-center px-0", open && "bg-header-fg/[0.22]")}>
          <BrandMark className="h-6 w-6 text-header-fg" imgClassName="h-6 max-w-[30px]" />
        </span>
        {branding.showNameInHeader && (
          <span className="hidden min-w-0 flex-col leading-tight sm:flex">
            <span className="text-[16px] font-semibold tracking-[-0.01em]">{branding.appName}</span>
            {canSwitch && <span className="text-[11.5px] font-medium text-header-fg/60">{mode === "email" ? "Email Marketing" : mode === "linkedin" ? "LinkedIn" : mode === "log" ? "Outreach & Jobs" : "Cold Calling"}</span>}
          </span>
        )}
      </>
    ) : (
      <Logo />
    );

  if (!canSwitch) {
    return (
      <Link href={home} className="flex shrink-0 items-center gap-3 pr-1" aria-label={`${branding.appName} home`}>
        {mark}
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Switch app — currently ${current.label}`}
        className={cn("flex items-center gap-3 rounded-[14px] pr-1 text-left", variant === "classic" && "gap-2")}
      >
        {mark}
        <ChevronDown className={cn("h-4 w-4 shrink-0 opacity-70 transition-transform", open && "rotate-180", variant === "bar" ? "text-header-fg" : "text-neutral-500")} />
      </button>
      {open && (
        <div className={cn(panel, "left-0 w-[min(320px,calc(100vw-48px))] p-2.5")} role="menu">
          <p className="px-3 pb-2 pt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">Switch to</p>
          {visibleApps.map((a) => {
            const active = a.mode === mode;
            return (
              <Link
                key={a.mode}
                href={a.href}
                role="menuitem"
                onClick={onClose}
                className={cn("flex items-center gap-3.5 rounded-2xl px-3 py-3 transition-colors", active ? "bg-page" : "hover:bg-page")}
              >
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[14px]", active ? "bg-ink text-white" : "bg-soft text-ink")}>
                  <a.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">{a.label}</span>
                  <span className="mt-0.5 block text-[12.5px] text-neutral-500">{a.hint}</span>
                </span>
                {active && <Check className="h-4 w-4 shrink-0 text-ink" strokeWidth={2.2} />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Bar header (white-label default) ────────────────────────

/** Translucent rounded tile on the coloured bar. */
const tile =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-[14px] bg-header-fg/[0.12] px-4 text-[15px] font-medium text-header-fg transition-colors hover:bg-header-fg/[0.2]";

function BarHeader() {
  const { open, close, toggle } = useMenus();
  const { mode } = useNav();

  return (
    <header className={STICKY}>
      <div className="mx-auto max-w-[1440px] px-6 pb-3 pt-5 lg:px-10">
      <div className="flex h-[68px] items-center gap-2 rounded-[22px] bg-header px-3 text-header-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.07),0_1px_2px_rgba(10,10,10,0.08)]">
        <AppSwitcher variant="bar" open={open === "apps"} onToggle={() => toggle("apps")} onClose={close} />

        <BarNav open={open === "more"} onToggle={() => toggle("more")} onClose={close} />
        <div className="xl:hidden">
          <PageSwitcher open={open === "pages"} onToggle={() => toggle("pages")} onClose={close} />
        </div>
        <span className="mx-1.5 hidden h-6 w-px bg-header-fg/25 xl:block" />
        <SearchButton variant="bar" open={open === "search"} onToggle={() => toggle("search")} onClose={close} />
        {mode === "email" ? (
          <Link href="/email/campaigns/new" className={cn(tile, "hidden md:inline-flex")}>
            <MailPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="hidden 2xl:inline">New campaign</span>
          </Link>
        ) : mode === "log" ? (
          <Link href="/log/outreach?new=1" className={cn(tile, "hidden md:inline-flex")}>
            <MessageSquarePlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="hidden 2xl:inline">Log outreach</span>
          </Link>
        ) : mode === "linkedin" ? (
          <Link href="/linkedin/campaigns?new=1" className={cn(tile, "hidden md:inline-flex")}>
            <MessageSquarePlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="hidden 2xl:inline">New campaign</span>
          </Link>
        ) : (
          <Link href="/leads?new=1" className={cn(tile, "hidden md:inline-flex")}>
            <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span className="hidden 2xl:inline">Add lead</span>
          </Link>
        )}
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
  const ref = useDismiss(open, onClose);
  const { primary, more, isActive } = useNav();
  const link = "flex h-10 shrink-0 items-center gap-2 rounded-[12px] px-3.5 text-[14px] font-medium transition-colors";
  const on = "bg-header-fg text-header";
  const off = "text-header-fg/75 hover:bg-header-fg/[0.12] hover:text-header-fg";

  return (
    <nav className="ml-1 hidden items-center gap-0.5 xl:flex" aria-label="Main">
      {primary.map((e) => {
        const active = isActive(e);
        return (
          <Link key={e.key} href={e.href} className={cn(link, active ? on : off)} aria-current={active ? "page" : undefined}>
            {active && <e.icon className="h-4 w-4" strokeWidth={2} />}
            {e.label}
            <CountBadge n={e.badge} />
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
              {more.map((e) => (
                <MenuLink key={e.key} entry={e} active={isActive(e)} />
              ))}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

function PageSwitcher({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const ref = useDismiss(open, onClose);
  const { primary, more, isActive } = useNav();
  const all = [...primary, ...more];
  const current = all.find(isActive) ?? all[0];

  return (
    <div ref={ref} className="relative">
      <button onClick={onToggle} className={cn(tile, open && "bg-header-fg/[0.22]")} aria-haspopup="menu" aria-expanded={open}>
        <current.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {current.label}
        <ChevronDown className={cn("h-4 w-4 opacity-80 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className={cn(panel, "left-0 w-[280px] p-2.5")} role="menu">
          <p className="px-3 pb-2 pt-1.5 text-[11.5px] uppercase tracking-[0.06em] text-neutral-400">Go to</p>
          <div className="grid grid-cols-1 gap-0.5">
            {all.map((e) => (
              <MenuLink key={e.key} entry={e} active={e.key === current.key} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CreateMenu({ open, onToggle, onClose }: { open: boolean; onToggle: () => void; onClose: () => void }) {
  const { perms } = useCrm();
  const { mode } = useNav();
  const router = useRouter();
  const ref = useDismiss(open, onClose);
  const [modal, setModal] = useState<null | "meeting" | "payment">(null);

  const items: { icon: LucideIcon; label: string; hint: string; run: () => void }[] =
    mode === "log"
      ? [
          { icon: MessageSquarePlus, label: "Log outreach", hint: "WhatsApp, email or DM", run: () => router.push("/log/outreach?new=1") },
          { icon: Briefcase, label: "Log job application", hint: "A remote job you applied to", run: () => router.push("/log/jobs?new=1") },
          { icon: Users, label: "Add sending account", hint: "Another WhatsApp, inbox or profile", run: () => router.push("/log/accounts?new=1") },
        ]
      : mode === "linkedin"
      ? [
          { icon: MessageSquarePlus, label: "New campaign", hint: "Outreach sequence", run: () => router.push("/linkedin/campaigns?new=1") },
          { icon: Users, label: "Add account", hint: "LinkedIn sender account", run: () => router.push("/linkedin/accounts?new=1") },
          { icon: Upload, label: "Import prospects", hint: "Upload a CSV file", run: () => router.push("/linkedin/prospects?import=1") },
          { icon: LayoutTemplate, label: "New template", hint: "Reusable message text", run: () => router.push("/linkedin/templates?new=1") },
        ]
      : mode === "email"
      ? [
          { icon: Send, label: "New campaign", hint: "Email a list of contacts", run: () => router.push("/email/campaigns/new") },
          { icon: Workflow, label: "New automation", hint: "A follow-up email sequence", run: () => router.push("/email/automations/new") },
          { icon: LayoutTemplate, label: "New template", hint: "Reusable email design", run: () => router.push("/email/templates?new=1") },
          { icon: Upload, label: "Import contacts", hint: "Upload a CSV file", run: () => router.push("/email/contacts?import=1") },
        ]
      : [
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
  const { primary, more, isActive } = useNav();
  const { open, close, toggle } = useMenus();
  const moreRef = useDismiss(open === "more", close);
  const mobileRef = useDismiss(open === "pages", close);

  return (
    <header className={STICKY}>
      <div className="mx-auto flex h-20 max-w-[1440px] items-center px-6 lg:px-10">
      <AppSwitcher variant="classic" open={open === "apps"} onToggle={() => toggle("apps")} onClose={close} />

      <nav className="ml-12 hidden items-center gap-1 xl:flex">
        {primary.map((e) => (
          <NavLink key={e.key} entry={e} active={isActive(e)} />
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
                {more.map((e) => (
                  <MenuLink key={e.key} entry={e} active={isActive(e)} />
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
              {[...primary, ...more].map((e) => (
                <MenuLink key={e.key} entry={e} active={isActive(e)} />
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </header>
  );
}

function NavLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex h-9 items-center gap-2 rounded-full px-4 text-[13.5px] transition-colors",
        active ? "bg-ink text-white" : "text-neutral-700 hover:text-ink"
      )}
    >
      {active && <entry.icon className="h-3.5 w-3.5" strokeWidth={2} />}
      {entry.label}
      <CountBadge n={entry.badge} />
    </Link>
  );
}

function MenuLink({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3.5 text-[14px] transition-colors",
        active ? "bg-ink text-white" : "text-ink hover:bg-page"
      )}
    >
      <entry.icon className="h-4 w-4" strokeWidth={1.8} />
      <span className="flex-1">{entry.label}</span>
      <CountBadge n={entry.badge} />
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
  const { mode } = useNav();
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
          (digits.length >= 3 && l.phone.replace(/\D/g, "").includes(digits)) ||
          (mode === "email" && l.email.toLowerCase().includes(term))
      )
      .slice(0, 7);
  }, [q, data.leads, mode]);

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
              placeholder={mode === "email" ? "Search business, contact or email…" : "Search business, owner or phone…"}
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
                    router.push(mode === "email" ? `/email/contacts?contact=${l.id}` : `/leads?lead=${l.id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-page"
                >
                  <LeadThumb lead={l} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium">{l.businessName}</span>
                    <span className="block truncate text-[12px] text-neutral-500">
                      {[l.decisionMakerName, mode === "email" ? l.email : l.phone].filter(Boolean).join(" · ")}
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
  const unreadReplies = useContext(UnreadReplies);
  const router = useRouter();
  const ref = useDismiss(open, onClose);

  const items = useMemo(() => {
    const today = todayKey();
    const now = new Date().toISOString();
    const mine = (userId: string | null) => perms.seesTeam || userId === viewer.id;
    const out: { id: string; icon: LucideIcon; title: string; body: string; href: string }[] = [];

    if (perms.emailMarketing && unreadReplies > 0)
      out.push({
        id: "replies",
        icon: Inbox,
        title: `${unreadReplies} unread email repl${unreadReplies === 1 ? "y" : "ies"}`,
        body: "Open the email inbox",
        href: "/email/inbox?folder=unread",
      });

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
  }, [data, viewer.id, perms.seesTeam, perms.emailMarketing, unreadReplies]);

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
  const { viewer, activeShift, clockIn, clockOut } = useCrm();
  const ref = useDismiss(open, onClose);
  const [changingPassword, setChangingPassword] = useState(false);
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

          <div className="mt-2 flex flex-col gap-0.5 border-t border-neutral-100 pt-2">
            <p className="px-3 pb-1 pt-1.5 text-[12px] text-neutral-500">
              {ROLE_LABELS[viewer.role]} · {viewer.email}
            </p>
            <button
              onClick={() => {
                onClose();
                setChangingPassword(true);
              }}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13.5px] hover:bg-page"
            >
              <KeyRound className="h-4 w-4" strokeWidth={1.8} /> Change password
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13.5px] text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.8} /> Sign out
            </button>
          </div>
        </div>
      )}
      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}
