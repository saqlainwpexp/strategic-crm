// Domain types shared by the UI. They mirror prisma/schema.prisma; dates are ISO strings
// so they serialise cleanly from server to client components.

import type { AgencyService, PipelineStage, Priority } from "./constants";

export type Role = "SALES" | "BD" | "MANAGER" | "SUPER_ADMIN";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  reportsToId: string | null;
  active: boolean;
};

export type CustomFieldValue = string | number | boolean | null;

export type Lead = {
  id: string;
  businessName: string;
  address: string;
  city: string;
  website: string;
  issues: string;
  suggestedServices: string;
  phone: string;
  email: string;
  priority: Priority;
  source: string;
  decisionMakerName: string;
  leadScore: number;
  stage: PipelineStage;
  service: AgencyService;
  estimatedValue: number;
  assignedToId: string | null;
  poolId: string | null;
  notes: string;
  customFields: Record<string, CustomFieldValue>;
  createdAt: string;
  lastContactedAt: string | null;
  nextFollowUpAt: string | null;
  /** When the lead became a signed client (stage CLOSED_WON). */
  closedAt: string | null;
};

export type CallDisposition =
  | "CONNECTED"
  | "NO_ANSWER"
  | "VOICEMAIL"
  | "BUSY"
  | "WRONG_NUMBER"
  | "INTERESTED"
  | "NOT_INTERESTED"
  | "CALL_ME_LATER"
  | "MEETING_BOOKED"
  | "HUNG_UP";

export type CallLog = {
  id: string;
  leadId: string;
  userId: string;
  startedAt: string;
  durationSec: number;
  disposition: CallDisposition;
  scriptId: string | null;
  notes: string;
};

export type MeetingStatus = "BOOKED" | "SHOWED" | "NO_SHOW" | "CANCELLED";
export type MeetingType = "DISCOVERY" | "FOLLOW_UP" | "PROPOSAL" | "ONBOARDING";

export type Meeting = {
  id: string;
  leadId: string;
  userId: string;
  title: string;
  type: MeetingType;
  scheduledAt: string;
  durationMin: number;
  status: MeetingStatus;
  notes: string;
};

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "REFUNDED";

export type Payment = {
  id: string;
  invoiceNo: string;
  leadId: string;
  userId: string;
  service: AgencyService;
  amount: number;
  status: PaymentStatus;
  dueDate: string;
  paidAt: string | null;
};

export type Script = {
  id: string;
  title: string;
  category: string;
  body: string;
  active: boolean;
  createdById: string;
  updatedAt: string;
};

export type CustomFieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN" | "URL";

export type CustomFieldDef = {
  id: string;
  key: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  active: boolean;
};

export type Pool = {
  id: string;
  name: string;
  description: string;
};

export type TimeLog = {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
};

export type CsvImport = {
  id: string;
  fileName: string;
  rowCount: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  uploadedById: string;
  poolId: string | null;
  createdAt: string;
};

export type DialerScheme = "zoomphonecall://" | "tel:" | "callto:";

export type Settings = {
  hotThreshold: number;
  warmThreshold: number;
  dialerScheme: DialerScheme;
  /** Minutes before a follow-up/meeting that the rep gets a reminder. */
  reminderMinutes: number;
  currency: string;
  timezone: string;
};

export type CrmData = {
  users: User[];
  leads: Lead[];
  calls: CallLog[];
  meetings: Meeting[];
  payments: Payment[];
  scripts: Script[];
  customFields: CustomFieldDef[];
  pools: Pool[];
  timeLogs: TimeLog[];
  imports: CsvImport[];
  settings: Settings;
};
