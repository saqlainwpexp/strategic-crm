// Email marketing: shared types and pure helpers (safe for both the browser and the server).

import type { PipelineStage, Temperature } from "./constants";

// ─── Audience ────────────────────────────────────────────────

/** Who a campaign goes to. Empty arrays mean "any". Leads must have an email and not be unsubscribed/bounced. */
export type AudienceFilter = {
  /** Explicit pick: when non-empty, only these leads (other filters ignored). */
  leadIds: string[];
  stages: PipelineStage[];
  temperatures: Temperature[];
  services: string[];
  tags: string[];
  poolIds: string[];
  sources: string[];
  cities: string[];
  assignedToIds: string[];
  /** Skip leads already emailed in the last N days (0 = off). */
  excludeEmailedWithinDays: number;
};

export const EMPTY_AUDIENCE: AudienceFilter = {
  leadIds: [],
  stages: [],
  temperatures: [],
  services: [],
  tags: [],
  poolIds: [],
  sources: [],
  cities: [],
  assignedToIds: [],
  excludeEmailedWithinDays: 0,
};

export function normalizeAudience(v: unknown): AudienceFilter {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const arr = (k: keyof AudienceFilter) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5000) : [];
  return {
    leadIds: arr("leadIds"),
    stages: arr("stages") as PipelineStage[],
    temperatures: arr("temperatures") as Temperature[],
    services: arr("services"),
    tags: arr("tags"),
    poolIds: arr("poolIds"),
    sources: arr("sources"),
    cities: arr("cities"),
    assignedToIds: arr("assignedToIds"),
    excludeEmailedWithinDays: Math.max(0, Math.min(365, Number(o.excludeEmailedWithinDays) || 0)),
  };
}

export function audienceSummary(a: AudienceFilter): string {
  if (a.leadIds.length) return `${a.leadIds.length} hand-picked contact${a.leadIds.length === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (a.tags.length) parts.push(`tag ${a.tags.join(", ")}`);
  if (a.stages.length) parts.push(`${a.stages.length} stage${a.stages.length === 1 ? "" : "s"}`);
  if (a.temperatures.length) parts.push(a.temperatures.map((t) => t.toLowerCase()).join("/"));
  if (a.services.length) parts.push(a.services.join(", "));
  if (a.cities.length) parts.push(a.cities.join(", "));
  if (a.sources.length) parts.push(`source ${a.sources.join(", ")}`);
  if (a.poolIds.length) parts.push(`${a.poolIds.length} pool${a.poolIds.length === 1 ? "" : "s"}`);
  if (a.assignedToIds.length) parts.push(`${a.assignedToIds.length} rep${a.assignedToIds.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(" · ") : "All subscribed contacts";
}

// ─── Contacts ────────────────────────────────────────────────

export type ContactStatus = "SUBSCRIBED" | "UNSUBSCRIBED" | "BOUNCED" | "NO_EMAIL";

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  SUBSCRIBED: "Subscribed",
  UNSUBSCRIBED: "Unsubscribed",
  BOUNCED: "Bounced",
  NO_EMAIL: "No email",
};

export const CONTACT_STATUS_COLOR: Record<ContactStatus, string> = {
  SUBSCRIBED: "#1F9D4C",
  UNSUBSCRIBED: "#9CA3AF",
  BOUNCED: "#E11D48",
  NO_EMAIL: "#D4D4D4",
};

export const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

export function isValidEmail(v: string) {
  return EMAIL_RE.test(v.trim());
}

export function normalizeTags(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out = new Set<string>();
  for (const t of v) if (typeof t === "string" && t.trim()) out.add(t.trim().slice(0, 40));
  return [...out].slice(0, 30);
}

// ─── Automations ─────────────────────────────────────────────

export type WaitUnit = "minutes" | "hours" | "days";

export type AutomationStep =
  | { id: string; type: "email"; subject: string; html: string }
  | { id: string; type: "wait"; amount: number; unit: WaitUnit };

export type AutomationTrigger = "MANUAL" | "LEAD_CREATED" | "STAGE_CHANGED" | "TAG_ADDED" | "EMAIL_REPLIED";

export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  MANUAL: "Added by hand",
  LEAD_CREATED: "New lead is created or imported",
  STAGE_CHANGED: "Lead moves to a pipeline stage",
  TAG_ADDED: "Tag is added to a contact",
  EMAIL_REPLIED: "Contact replies to an email",
};

export const WAIT_MS: Record<WaitUnit, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function normalizeSteps(v: unknown): AutomationStep[] {
  if (!Array.isArray(v)) return [];
  const out: AutomationStep[] = [];
  for (const s of v.slice(0, 30)) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id ? o.id.slice(0, 40) : Math.random().toString(36).slice(2, 10);
    if (o.type === "email") {
      out.push({ id, type: "email", subject: String(o.subject ?? "").slice(0, 300), html: String(o.html ?? "").slice(0, 200_000) });
    } else if (o.type === "wait") {
      const unit: WaitUnit = o.unit === "minutes" || o.unit === "hours" ? o.unit : "days";
      out.push({ id, type: "wait", amount: Math.max(1, Math.min(365, Math.round(Number(o.amount) || 1))), unit });
    }
  }
  return out;
}

export function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ─── Merge tags ──────────────────────────────────────────────

export const MERGE_TAGS: { tag: string; label: string }[] = [
  { tag: "{{first_name}}", label: "First name" },
  { tag: "{{name}}", label: "Contact name" },
  { tag: "{{business_name}}", label: "Business name" },
  { tag: "{{city}}", label: "City" },
  { tag: "{{website}}", label: "Website" },
  { tag: "{{service}}", label: "Service" },
  { tag: "{{sender_name}}", label: "Sender name" },
  { tag: "{{agency_name}}", label: "Agency name" },
  { tag: "{{unsubscribe_link}}", label: "Unsubscribe link" },
];

export type MergeData = {
  decisionMakerName: string;
  businessName: string;
  city: string;
  website: string;
  service: string;
  email: string;
  senderName: string;
  agencyName: string;
  unsubscribeUrl: string;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Replace {{tags}}. Supports a fallback: {{first_name|there}}. Values are HTML-escaped when
 * `html` is true so lead data can't inject markup into an email.
 */
export function fillMergeTags(text: string, d: MergeData, html: boolean): string {
  const first = d.decisionMakerName.trim().split(/\s+/)[0] ?? "";
  const values: Record<string, string> = {
    first_name: first,
    name: d.decisionMakerName.trim(),
    business_name: d.businessName,
    company: d.businessName,
    city: d.city,
    website: d.website,
    service: d.service,
    email: d.email,
    sender_name: d.senderName,
    agency_name: d.agencyName,
    unsubscribe_link: d.unsubscribeUrl,
  };
  return text.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi, (whole, key: string, fallback?: string) => {
    const k = key.toLowerCase();
    if (!(k in values)) return whole;
    const v = values[k] || (fallback ?? "").trim();
    return html && k !== "unsubscribe_link" ? escapeHtml(v) : v;
  });
}

export const SAMPLE_MERGE: MergeData = {
  decisionMakerName: "Sarah Johnson",
  businessName: "Harbor Dental Studio",
  city: "Boston",
  website: "https://www.harbordental.com",
  service: "Web Design",
  email: "sarah@harbordental.com",
  senderName: "Alex",
  agencyName: "Your Agency",
  unsubscribeUrl: "#unsubscribe",
};

/** Plain-text version of an HTML email (for the text/plain part and the inbox). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── Sending accounts ────────────────────────────────────────

export const SMTP_PRESETS: {
  label: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  note: string;
}[] = [
  {
    label: "Hostinger",
    smtpHost: "smtp.hostinger.com",
    smtpPort: 465,
    imapHost: "imap.hostinger.com",
    note: "Use the full email address and its password from hPanel → Emails → Email accounts.",
  },
  {
    label: "Google Workspace / Gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    imapHost: "imap.gmail.com",
    note: "Gmail needs an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password.",
  },
  {
    label: "Microsoft 365 / Outlook",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    imapHost: "outlook.office365.com",
    note: "SMTP AUTH must be enabled for the mailbox in the Microsoft 365 admin centre.",
  },
  {
    label: "Zoho Mail",
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    imapHost: "imap.zoho.com",
    note: "Enable IMAP access in Zoho Mail settings. Use an app-specific password if 2FA is on.",
  },
  { label: "Custom", smtpHost: "", smtpPort: 465, imapHost: "", note: "" },
];

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
