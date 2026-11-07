import type { OutreachActivityType, OutreachStage, ReplySentiment } from "./platforms";

export type SocialProfile = { id: string; leadId: string; platform: string; url: string };

export type OThread = {
  id: string;
  leadId: string;
  ownerId: string | null;
  platform: string;
  threadUrl: string;
  stage: OutreachStage;
  connectionSentAt: string | null;
  connectionAcceptedAt: string | null;
  firstMessageAt: string | null;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
  followupCount: number;
  nextFollowupAt: string | null;
  replySentiment: ReplySentiment | null;
  templateId: string | null;
  campaignId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  /** Copied from the lead so a rep sees the card even if the lead is assigned to someone else. */
  leadName: string;
  company: string;
  jobTitle: string;
  /** Profile URL on this platform, if known. */
  profileUrl: string;
};

export type OActivity = {
  id: string;
  threadId: string;
  leadId: string;
  userId: string | null;
  platform: string;
  direction: "outbound" | "inbound";
  type: OutreachActivityType;
  messageText: string;
  occurredAt: string;
};

export type OTemplate = { id: string; name: string; platform: string; body: string; active: boolean; createdById: string | null };

export type OCampaign = {
  id: string;
  name: string;
  platform: string;
  audience: string;
  templateId: string | null;
  startDate: string | null;
  dailyLimit: number | null;
  goal: string;
  status: string;
};

export type OSocialAccount = {
  id: string;
  userId: string;
  platform: string;
  handle: string;
  dailyConnectionLimit: number;
  dailyDmLimit: number;
};

export type LeadSocialFields = {
  jobTitle: string;
  industry: string;
  location: string;
  connectionDegree: string;
  followerCount: number | null;
  primaryChannel: string;
};

export type OutreachData = {
  profiles: SocialProfile[];
  threads: OThread[];
  activities: OActivity[];
  templates: OTemplate[];
  campaigns: OCampaign[];
  accounts: OSocialAccount[];
  leadSources: string[];
  /** Social fields of the leads the viewer can see, keyed by lead id. */
  leadFields: Record<string, LeadSocialFields>;
};

export type QuickLogKind = "sent_connection" | "accepted" | "sent_dm" | "replied" | "interested" | "booked" | "not_interested" | "won";
