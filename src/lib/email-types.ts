// Plain (serialisable) shapes the email-marketing pages receive from the server.

import type { AudienceFilter, AutomationStep, AutomationTrigger, ContactStatus } from "./email";
import type { PipelineStage } from "./constants";

export type AccountStatus = "PENDING" | "CONNECTED" | "ERROR" | "DISCONNECTED";

export type EmailAccountView = {
  id: string;
  name: string;
  email: string;
  fromName: string;
  provider: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  imapEnabled: boolean;
  imapHost: string;
  imapPort: number;
  dailyLimit: number;
  minDelaySec: number;
  signature: string;
  status: AccountStatus;
  lastError: string | null;
  sentToday: number;
  lastSyncAt: string | null;
  totalSent: number;
};

export type DomainCheck = "pass" | "fail" | "warn" | "pending";

export type EmailDomainView = {
  id: string;
  domain: string;
  spf: DomainCheck;
  dkim: DomainCheck;
  dmarc: DomainCheck;
  details: { spfRecord?: string; dmarcRecord?: string; dkimSelector?: string; provider?: string; spfInclude?: string } | null;
  lastCheckedAt: string | null;
};

export type TemplateView = { id: string; name: string; subject: string; html: string; updatedAt: string };

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "PAUSED" | "SENT" | "CANCELLED";

export type SendStats = {
  total: number;
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
};

export type CampaignView = {
  id: string;
  name: string;
  subject: string;
  previewText: string;
  html: string;
  fromName: string;
  replyTo: string;
  accountIds: string[];
  audience: AudienceFilter;
  trackOpens: boolean;
  trackClicks: boolean;
  addUnsubscribe: boolean;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
  stats: SendStats;
};

export type RecipientView = {
  id: string;
  leadId: string | null;
  businessName: string;
  contactName: string;
  email: string;
  status: "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
  error: string | null;
  sentAt: string | null;
  openedAt: string | null;
  openCount: number;
  clickedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  accountEmail: string | null;
};

export type AutomationView = {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  triggerValue: string;
  steps: AutomationStep[];
  accountIds: string[];
  stopOnReply: boolean;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  createdAt: string;
  updatedAt: string;
  counts: { active: number; completed: number; stopped: number };
  stats: SendStats;
};

export type EnrollmentView = {
  id: string;
  leadId: string;
  businessName: string;
  email: string;
  stepIndex: number;
  status: "ACTIVE" | "COMPLETED" | "STOPPED";
  stopReason: string | null;
  nextRunAt: string | null;
  enrolledAt: string;
};

export type ContactView = {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  stage: PipelineStage;
  service: string;
  leadScore: number;
  tags: string[];
  status: ContactStatus;
  lastEmailedAt: string | null;
  sent: number;
  opened: number;
  replied: number;
};

export type ContactActivity = {
  sends: {
    id: string;
    source: string;
    subject: string;
    status: RecipientView["status"];
    sentAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    repliedAt: string | null;
    bouncedAt: string | null;
  }[];
  enrollments: { id: string; automation: string; status: EnrollmentView["status"]; stopReason: string | null; enrolledAt: string }[];
};

export type ThreadSummary = {
  id: string;
  subject: string;
  contactEmail: string;
  contactName: string;
  businessName: string | null;
  leadId: string | null;
  accountId: string;
  accountEmail: string;
  unread: boolean;
  archived: boolean;
  lastMessageAt: string;
  snippet: string;
};

export type ThreadMessage = {
  id: string;
  direction: "IN" | "OUT";
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  sentAt: string;
};

export type EmailOverview = {
  stats: SendStats & { unsubscribed: number; contacts: number; mailable: number };
  daily: { day: string; sent: number; opened: number; replied: number }[];
  campaigns: CampaignView[];
  accounts: EmailAccountView[];
  activeAutomations: number;
  unreadReplies: number;
};

/** Options the audience builder and filters offer (distinct values present in the CRM). */
export type AudienceOptions = {
  tags: string[];
  sources: string[];
  cities: string[];
  pools: { id: string; name: string }[];
  reps: { id: string; name: string }[];
};
