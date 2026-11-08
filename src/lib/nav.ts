import type { Role } from "./types";

export type NavKey =
  | "loadboard"
  | "dashboard"
  | "leads"
  | "pipeline"
  | "schedule"
  | "team"
  | "scripts"
  | "admin";

/** Where everyone lands after signing in. */
export const HOME_PATH = "/loadboard";

export const NAV_ITEMS: Record<NavKey, { label: string; href: string }> = {
  loadboard: { label: "Loadboard", href: "/loadboard" },
  dashboard: { label: "Dashboard", href: "/dashboard" },
  leads: { label: "Leads", href: "/leads" },
  pipeline: { label: "Pipeline", href: "/pipeline" },
  schedule: { label: "Schedule", href: "/schedule" },
  team: { label: "Team", href: "/team" },
  scripts: { label: "Scripts", href: "/scripts" },
  admin: { label: "Admin", href: "/admin" },
};

/**
 * Main nav items per role; `more` overflows into a dropdown. Sales and analytics live
 * inside the Dashboard (tabs), so they aren't separate items.
 */
export function navFor(role: Role): { primary: NavKey[]; more: NavKey[] } {
  switch (role) {
    case "SALES":
      return { primary: ["loadboard", "dashboard", "leads", "pipeline", "schedule", "scripts"], more: [] };
    case "BD":
      return { primary: ["loadboard", "dashboard", "leads", "pipeline", "schedule", "team"], more: ["scripts"] };
    case "MANAGER":
      return { primary: ["loadboard", "dashboard", "leads", "pipeline", "schedule", "team"], more: ["scripts"] };
    case "SUPER_ADMIN":
      return { primary: ["loadboard", "dashboard", "leads", "pipeline", "team", "admin"], more: ["schedule", "scripts"] };
  }
}

// ─── Email marketing ─────────────────────────────────────────

/** The apps behind the logo switcher. */
export type AppMode = "calling" | "email" | "linkedin" | "log";

export const EMAIL_HOME = "/email";

export type EmailNavKey = "overview" | "campaigns" | "automations" | "inbox" | "contacts" | "templates" | "sending";

export const EMAIL_NAV: Record<EmailNavKey, { label: string; href: string; exact?: boolean }> = {
  overview: { label: "Dashboard", href: "/email", exact: true },
  campaigns: { label: "Campaigns", href: "/email/campaigns" },
  automations: { label: "Automations", href: "/email/automations" },
  inbox: { label: "Inbox", href: "/email/inbox" },
  contacts: { label: "Contacts", href: "/email/contacts" },
  templates: { label: "Templates", href: "/email/templates" },
  sending: { label: "Sending", href: "/email/sending" },
};

export const EMAIL_NAV_ORDER: { primary: EmailNavKey[]; more: EmailNavKey[] } = {
  primary: ["overview", "campaigns", "automations", "inbox", "contacts"],
  more: ["templates", "sending"],
};

export function modeFor(pathname: string): AppMode {
  if (pathname === "/email" || pathname.startsWith("/email/")) return "email";
  if (pathname === "/linkedin" || pathname.startsWith("/linkedin/")) return "linkedin";
  if (pathname === "/log" || pathname.startsWith("/log/")) return "log";
  return "calling";
}

// ─── LinkedIn automation ─────────────────────────────────────

export const LINKEDIN_HOME = "/linkedin";

export type LinkedInNavKey = "overview" | "accounts" | "campaigns" | "prospects" | "inbox" | "templates";

export const LINKEDIN_NAV: Record<LinkedInNavKey, { label: string; href: string; exact?: boolean }> = {
  overview: { label: "Dashboard", href: "/linkedin", exact: true },
  accounts: { label: "Accounts", href: "/linkedin/accounts" },
  campaigns: { label: "Campaigns", href: "/linkedin/campaigns" },
  prospects: { label: "Prospects", href: "/linkedin/prospects" },
  inbox: { label: "Inbox", href: "/linkedin/inbox" },
  templates: { label: "Templates", href: "/linkedin/templates" },
};

export const LINKEDIN_NAV_ORDER: { primary: LinkedInNavKey[]; more: LinkedInNavKey[] } = {
  primary: ["overview", "accounts", "campaigns", "prospects", "inbox"],
  more: ["templates"],
};

// ─── Outreach & Jobs log ─────────────────────────────────────

export const LOG_HOME = "/log";

export type LogNavKey = "today" | "outreach" | "jobs" | "accounts";

export const LOG_NAV: Record<LogNavKey, { label: string; href: string; exact?: boolean }> = {
  today: { label: "Today", href: "/log", exact: true },
  outreach: { label: "Outreach", href: "/log/outreach" },
  jobs: { label: "Jobs", href: "/log/jobs" },
  accounts: { label: "Accounts & agent", href: "/log/accounts" },
};

export const LOG_NAV_ORDER: { primary: LogNavKey[]; more: LogNavKey[] } = {
  primary: ["today", "outreach", "jobs", "accounts"],
  more: [],
};
