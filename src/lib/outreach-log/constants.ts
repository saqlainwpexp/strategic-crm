// Outreach & Jobs log — channels, stages and activity types (plain string ids, no migration
// needed to add one). Separate from the cold-calling CRM and its social outreach tab.

export const CHANNELS = [
  { id: "whatsapp", label: "WhatsApp", handleHint: "+92 300 1234567" },
  { id: "email", label: "Email", handleHint: "name@company.com" },
  { id: "linkedin", label: "LinkedIn", handleHint: "linkedin.com/in/…" },
  { id: "facebook", label: "Facebook", handleHint: "facebook.com/…" },
  { id: "instagram", label: "Instagram", handleHint: "@handle" },
  { id: "x", label: "X", handleHint: "@handle" },
  { id: "threads", label: "Threads", handleHint: "@handle" },
  { id: "tiktok", label: "TikTok", handleHint: "@handle" },
  { id: "telegram", label: "Telegram", handleHint: "@handle" },
  { id: "upwork", label: "Upwork", handleHint: "Profile name" },
  { id: "phone", label: "Phone / SMS", handleHint: "+1 555 0100" },
  { id: "other", label: "Other", handleHint: "" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];
export const CHANNEL_IDS = CHANNELS.map((c) => c.id) as ChannelId[];
export const isChannel = (v: unknown): v is ChannelId => typeof v === "string" && (CHANNEL_IDS as string[]).includes(v);
export const channelLabel = (id: string) => CHANNELS.find((c) => c.id === id)?.label ?? id;

/** Where remote jobs come from. */
export const JOB_SOURCES = [
  { id: "linkedin", label: "LinkedIn Jobs" },
  { id: "upwork", label: "Upwork" },
  { id: "wellfound", label: "Wellfound" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "remoteok", label: "RemoteOK" },
  { id: "indeed", label: "Indeed" },
  { id: "glassdoor", label: "Glassdoor" },
  { id: "fiverr", label: "Fiverr" },
  { id: "freelancer", label: "Freelancer" },
  { id: "toptal", label: "Toptal" },
  { id: "contra", label: "Contra" },
  { id: "company_site", label: "Company site" },
  { id: "email", label: "Cold email" },
  { id: "referral", label: "Referral" },
  { id: "other", label: "Other" },
] as const;
export type JobSourceId = (typeof JOB_SOURCES)[number]["id"];
export const JOB_SOURCE_IDS = JOB_SOURCES.map((s) => s.id) as JobSourceId[];
export const jobSourceLabel = (id: string) => JOB_SOURCES.find((s) => s.id === id)?.label ?? id;

export const CONTACT_STAGES = ["new", "contacted", "followed_up", "replied", "interested", "meeting", "won", "lost", "no_response"] as const;
export type ContactStage = (typeof CONTACT_STAGES)[number];
export const CONTACT_STAGE_LABEL: Record<ContactStage, string> = {
  new: "New",
  contacted: "Contacted",
  followed_up: "Followed up",
  replied: "Replied",
  interested: "Interested",
  meeting: "Meeting",
  won: "Won",
  lost: "Lost",
  no_response: "No response",
};

export const JOB_STAGES = ["saved", "applied", "followed_up", "responded", "interview", "assessment", "offer", "hired", "rejected", "ghosted", "withdrawn"] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export const JOB_STAGE_LABEL: Record<JobStage, string> = {
  saved: "Saved",
  applied: "Applied",
  followed_up: "Followed up",
  responded: "Responded",
  interview: "Interview",
  assessment: "Assessment",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  ghosted: "Ghosted",
  withdrawn: "Withdrawn",
};

/** Things you can log on an outreach contact. */
export const CONTACT_EVENTS = ["sent", "followup", "reply", "note"] as const;
export type ContactEvent = (typeof CONTACT_EVENTS)[number];

/** Things you can log on a job application. */
export const JOB_EVENTS = ["applied", "followup", "response", "interview", "assessment", "offer", "rejected", "note"] as const;
export type JobEvent = (typeof JOB_EVENTS)[number];

export const EVENT_LABEL: Record<string, string> = {
  sent: "Message sent",
  followup: "Follow-up sent",
  reply: "Reply received",
  note: "Note",
  applied: "Applied",
  response: "Response received",
  interview: "Interview scheduled",
  assessment: "Assessment",
  offer: "Offer",
  rejected: "Rejected",
  stage: "Stage changed",
};

export const STAGE_TONE: Record<string, string> = {
  new: "bg-neutral-100 text-neutral-600",
  saved: "bg-neutral-100 text-neutral-600",
  contacted: "bg-sky-50 text-sky-700",
  applied: "bg-sky-50 text-sky-700",
  followed_up: "bg-indigo-50 text-indigo-700",
  replied: "bg-amber-50 text-amber-700",
  responded: "bg-amber-50 text-amber-700",
  interested: "bg-orange-50 text-orange-700",
  meeting: "bg-violet-50 text-violet-700",
  interview: "bg-violet-50 text-violet-700",
  assessment: "bg-violet-50 text-violet-700",
  offer: "bg-emerald-50 text-emerald-700",
  won: "bg-emerald-100 text-emerald-800",
  hired: "bg-emerald-100 text-emerald-800",
  lost: "bg-rose-50 text-rose-700",
  rejected: "bg-rose-50 text-rose-700",
  no_response: "bg-neutral-100 text-neutral-500",
  ghosted: "bg-neutral-100 text-neutral-500",
  withdrawn: "bg-neutral-100 text-neutral-500",
};
