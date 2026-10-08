// Shared domain constants for Strategic CRM

export const AGENCY_SERVICES = ["Web Design", "Graphic Design", "GHL"] as const;
export type AgencyService = (typeof AGENCY_SERVICES)[number];

export const SERVICE_COLORS: Record<AgencyService, string> = {
  "Web Design": "rgb(var(--brand-600))",
  "Graphic Design": "rgb(var(--brand-500))",
  GHL: "rgb(var(--brand-300))",
};

// ─── Pipeline ────────────────────────────────────────────────

export const PIPELINE_STAGES = [
  "LEAD",
  "CONTACTED",
  "INTERESTED",
  "MEETING_BOOKED",
  "SHOWED",
  "NO_SHOW",
  "NOT_INTERESTED",
  "HUNG_UP",
  "CALL_ME_LATER",
  "CLOSED_WON",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  LEAD: "Lead",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  MEETING_BOOKED: "Meeting Booked",
  SHOWED: "Showed",
  NO_SHOW: "No Show",
  NOT_INTERESTED: "Not Interested",
  HUNG_UP: "Hung Up",
  CALL_ME_LATER: "Call Me Later",
  CLOSED_WON: "Signed Up Client",
};

/** Square status-dot colour for each stage. */
export const STAGE_DOT: Record<PipelineStage, string> = {
  LEAD: "#A3A3A3",
  CONTACTED: "#3B82F6",
  INTERESTED: "rgb(var(--brand-500))",
  MEETING_BOOKED: "#22C55E",
  SHOWED: "#16A34A",
  NO_SHOW: "#EAB308",
  NOT_INTERESTED: "#737373",
  HUNG_UP: "#EF4444",
  CALL_ME_LATER: "#EAB308",
  CLOSED_WON: "#15803D",
};

/** Stages that count as an open (workable) lead. */
export const OPEN_STAGES: PipelineStage[] = [
  "LEAD",
  "CONTACTED",
  "INTERESTED",
  "MEETING_BOOKED",
  "SHOWED",
  "NO_SHOW",
  "CALL_ME_LATER",
];
/** Stages that count as an active deal. */
export const DEAL_STAGES: PipelineStage[] = ["INTERESTED", "MEETING_BOOKED", "SHOWED"];

// ─── Temperature (derived from lead score) ───────────────────

export type Temperature = "COLD" | "WARM" | "HOT";
export const TEMP_LABELS: Record<Temperature, string> = { COLD: "Cold", WARM: "Warm", HOT: "Hot" };
export const TEMP_COLOR: Record<Temperature, string> = {
  COLD: "#3B82F6",
  WARM: "#D97706",
  HOT: "#E5484D",
};

export function tempFromScore(score: number, hot = 75, warm = 40): Temperature {
  if (score >= hot) return "HOT";
  if (score >= warm) return "WARM";
  return "COLD";
}

// ─── Priority ────────────────────────────────────────────────

export type Priority = "LOW" | "MEDIUM" | "HIGH";
export const PRIORITIES: Priority[] = ["HIGH", "MEDIUM", "LOW"];
export const PRIORITY_LABELS: Record<Priority, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
export const PRIORITY_COLOR: Record<Priority, string> = {
  HIGH: "#E5484D",
  MEDIUM: "rgb(var(--brand-500))",
  LOW: "#8A8A8A",
};

// ─── Calls ───────────────────────────────────────────────────

export const DISPOSITIONS = [
  "CONNECTED",
  "NO_ANSWER",
  "VOICEMAIL",
  "BUSY",
  "WRONG_NUMBER",
  "INTERESTED",
  "NOT_INTERESTED",
  "CALL_ME_LATER",
  "MEETING_BOOKED",
  "HUNG_UP",
] as const;

export const DISPOSITION_LABELS: Record<(typeof DISPOSITIONS)[number], string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Voicemail",
  BUSY: "Busy",
  WRONG_NUMBER: "Wrong Number",
  INTERESTED: "Interested",
  NOT_INTERESTED: "Not Interested",
  CALL_ME_LATER: "Call Me Later",
  MEETING_BOOKED: "Meeting Booked",
  HUNG_UP: "Hung Up",
};

/** Pipeline stage a call outcome moves the lead to (null = leave stage as-is). */
export const DISPOSITION_TO_STAGE: Record<(typeof DISPOSITIONS)[number], PipelineStage | null> = {
  CONNECTED: "CONTACTED",
  NO_ANSWER: null,
  VOICEMAIL: null,
  BUSY: null,
  WRONG_NUMBER: null,
  INTERESTED: "INTERESTED",
  NOT_INTERESTED: "NOT_INTERESTED",
  CALL_ME_LATER: "CALL_ME_LATER",
  MEETING_BOOKED: "MEETING_BOOKED",
  HUNG_UP: "HUNG_UP",
};

/** Outcomes where a conversation actually happened. */
export const CONNECT_DISPOSITIONS = [
  "CONNECTED",
  "INTERESTED",
  "NOT_INTERESTED",
  "CALL_ME_LATER",
  "MEETING_BOOKED",
  "HUNG_UP",
];

// ─── Meetings & payments ─────────────────────────────────────

export const MEETING_TYPE_LABELS = {
  DISCOVERY: "Discovery Call",
  FOLLOW_UP: "Follow-up",
  PROPOSAL: "Proposal Review",
  ONBOARDING: "Onboarding",
} as const;

export const MEETING_STATUS_LABELS = {
  BOOKED: "Booked",
  SHOWED: "Showed",
  NO_SHOW: "No Show",
  CANCELLED: "Cancelled",
} as const;

export const MEETING_STATUS_DOT = {
  BOOKED: "#3B82F6",
  SHOWED: "#22C55E",
  NO_SHOW: "#EAB308",
  CANCELLED: "#A3A3A3",
} as const;

export const PAYMENT_STATUS_LABELS = {
  PENDING: "Pending",
  PARTIAL: "Partial",
  PAID: "Paid",
  REFUNDED: "Refunded",
} as const;

export const PAYMENT_STATUS_DOT = {
  PENDING: "#EAB308",
  PARTIAL: "#3B82F6",
  PAID: "#22C55E",
  REFUNDED: "#A3A3A3",
} as const;

// ─── Roles ───────────────────────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  SALES: "Sales Rep",
  BD: "Business Development",
  MANAGER: "Manager",
  SUPER_ADMIN: "Super Admin",
};

export const LEAD_SOURCES = [
  "Google Maps",
  "Facebook",
  "Instagram",
  "LinkedIn",
  "Referral",
  "Website Form",
  "Cold List",
];
