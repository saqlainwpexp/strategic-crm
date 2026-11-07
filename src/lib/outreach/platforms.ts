// The social networks the CRM tracks. To add one, add an entry here — the database stores
// platform ids as plain text, so no migration is needed.

export type PlatformId = "linkedin" | "facebook" | "instagram" | "threads" | "x" | "tiktok";

export type PlatformDef = {
  id: PlatformId;
  label: string;
  /** Brand colour for the small round icon. */
  color: string;
  /** One or two letters shown in the icon. */
  mark: string;
  /** Hostnames (without www./m.) that belong to this network. */
  hosts: string[];
  /** "url": the profile path identifies the person; "handle": a single @handle does. */
  idKind: "url" | "handle";
  /** Whether the network has connection requests (LinkedIn) or follows only. */
  hasConnections: boolean;
  defaultConnectionLimit: number;
  defaultDmLimit: number;
  /** Builds a profile URL from a stored handle (handle platforms only). */
  profileUrl?: (handle: string) => string;
};

export const PLATFORMS: PlatformDef[] = [
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2", mark: "in", hosts: ["linkedin.com"], idKind: "url", hasConnections: true, defaultConnectionLimit: 20, defaultDmLimit: 50 },
  { id: "facebook", label: "Facebook", color: "#1877F2", mark: "f", hosts: ["facebook.com", "fb.com", "messenger.com"], idKind: "url", hasConnections: true, defaultConnectionLimit: 20, defaultDmLimit: 50 },
  { id: "instagram", label: "Instagram", color: "#E1306C", mark: "IG", hosts: ["instagram.com"], idKind: "handle", hasConnections: false, defaultConnectionLimit: 0, defaultDmLimit: 50, profileUrl: (h) => `https://www.instagram.com/${h}/` },
  { id: "threads", label: "Threads", color: "#111111", mark: "@", hosts: ["threads.net", "threads.com"], idKind: "handle", hasConnections: false, defaultConnectionLimit: 0, defaultDmLimit: 40, profileUrl: (h) => `https://www.threads.net/@${h}` },
  { id: "x", label: "X", color: "#000000", mark: "X", hosts: ["x.com", "twitter.com"], idKind: "handle", hasConnections: false, defaultConnectionLimit: 0, defaultDmLimit: 40, profileUrl: (h) => `https://x.com/${h}` },
  { id: "tiktok", label: "TikTok", color: "#25F4EE", mark: "TT", hosts: ["tiktok.com"], idKind: "handle", hasConnections: false, defaultConnectionLimit: 0, defaultDmLimit: 40, profileUrl: (h) => `https://www.tiktok.com/@${h}` },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id) as PlatformId[];
const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

export function isPlatform(v: unknown): v is PlatformId {
  return typeof v === "string" && BY_ID.has(v as PlatformId);
}

export function platformDef(id: string): PlatformDef | undefined {
  return BY_ID.get(id as PlatformId);
}

export function platformLabel(id: string) {
  return platformDef(id)?.label ?? id;
}

/** Channels a lead can prefer: any social platform, or the existing phone/email. */
export const PRIMARY_CHANNELS = [...PLATFORM_IDS, "phone", "email"] as const;

// ─── Stages ──────────────────────────────────────────────────

export const OUTREACH_STAGES = [
  "not_contacted",
  "connection_sent",
  "connected",
  "message_sent",
  "replied",
  "interested",
  "call_booked",
  "won",
  "lost",
  "not_interested",
  "no_response",
] as const;
export type OutreachStage = (typeof OUTREACH_STAGES)[number];

export const STAGE_LABEL: Record<OutreachStage, string> = {
  not_contacted: "Not contacted",
  connection_sent: "Connection sent",
  connected: "Connected",
  message_sent: "Message sent",
  replied: "Replied",
  interested: "Interested",
  call_booked: "Call booked",
  won: "Won",
  lost: "Lost",
  not_interested: "Not interested",
  no_response: "No response",
};

export const STAGE_COLOR: Record<OutreachStage, string> = {
  not_contacted: "#A3A3A3",
  connection_sent: "#8B9CF7",
  connected: "#5B7CF5",
  message_sent: "#EA8B5E",
  replied: "#E5484D",
  interested: "#F5A524",
  call_booked: "#30A46C",
  won: "#18794E",
  lost: "#737373",
  not_interested: "#737373",
  no_response: "#A3A3A3",
};

/** Stages after which the thread is finished (no more follow-ups). */
export const CLOSED_STAGES: OutreachStage[] = ["won", "lost", "not_interested", "no_response"];

export const ACTIVITY_TYPES = ["connection_request", "dm", "comment", "like", "story_reply", "voice_note"] as const;
export type OutreachActivityType = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_LABEL: Record<OutreachActivityType, string> = {
  connection_request: "Connection request",
  dm: "DM",
  comment: "Comment",
  like: "Like",
  story_reply: "Story reply",
  voice_note: "Voice note",
};

export const SENTIMENTS = ["positive", "neutral", "negative", "objection"] as const;
export type ReplySentiment = (typeof SENTIMENTS)[number];

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed"] as const;

export const DEFAULT_LEAD_SOURCES = ["Sales Navigator", "Phantombuster", "Apify", "Facebook group", "Instagram hashtag", "Referral", "Inbound", "Bookmarklet", "Other"];
