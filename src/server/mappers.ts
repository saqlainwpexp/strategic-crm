// Prisma rows → the plain, serialisable shapes the UI uses (src/lib/types.ts).

import type {
  CallLog as DbCall,
  CsvImport as DbImport,
  CustomFieldDef as DbField,
  Lead as DbLead,
  Meeting as DbMeeting,
  Payment as DbPayment,
  Pool as DbPool,
  Script as DbScript,
  TimeLog as DbTimeLog,
  User as DbUser,
} from "@prisma/client";
import type {
  CallLog,
  CsvImport,
  CustomFieldDef,
  CustomFieldValue,
  Lead,
  Meeting,
  Payment,
  Pool,
  Script,
  TimeLog,
  User,
} from "@/lib/types";
import { AGENCY_SERVICES, type AgencyService } from "@/lib/constants";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const service = (s: string): AgencyService => (AGENCY_SERVICES as readonly string[]).includes(s) ? (s as AgencyService) : "Web Design";

export function toUser(u: DbUser): User {
  return { id: u.id, name: u.name, email: u.email, role: u.role, title: u.title, reportsToId: u.reportsToId, active: u.active };
}

export function toLead(l: DbLead): Lead {
  return {
    id: l.id,
    businessName: l.businessName,
    address: l.address ?? "",
    city: l.city ?? "",
    website: l.website ?? "",
    issues: l.issues ?? "",
    suggestedServices: l.suggestedServices ?? "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    priority: l.priority,
    source: l.source ?? "",
    decisionMakerName: l.decisionMakerName ?? "",
    leadScore: l.leadScore,
    stage: l.stage,
    service: service(l.service),
    estimatedValue: Number(l.estimatedValue),
    assignedToId: l.assignedToId,
    poolId: l.poolId,
    notes: l.notes ?? "",
    customFields: (l.customFields && typeof l.customFields === "object" && !Array.isArray(l.customFields)
      ? l.customFields
      : {}) as Record<string, CustomFieldValue>,
    createdAt: l.createdAt.toISOString(),
    lastContactedAt: iso(l.lastContactedAt),
    nextFollowUpAt: iso(l.nextFollowUpAt),
    closedAt: iso(l.closedAt),
  };
}

export function toCall(c: DbCall): CallLog {
  return {
    id: c.id,
    leadId: c.leadId,
    userId: c.userId,
    startedAt: c.startedAt.toISOString(),
    durationSec: c.durationSec,
    disposition: c.disposition ?? "CONNECTED",
    scriptId: c.scriptId,
    notes: c.notes ?? "",
  };
}

export function toMeeting(m: DbMeeting): Meeting {
  return {
    id: m.id,
    leadId: m.leadId,
    userId: m.userId,
    title: m.title,
    type: m.type,
    scheduledAt: m.scheduledAt.toISOString(),
    durationMin: m.durationMin,
    status: m.status,
    notes: m.notes ?? "",
  };
}

export function toPayment(p: DbPayment): Payment {
  return {
    id: p.id,
    invoiceNo: p.invoiceNo,
    leadId: p.leadId,
    userId: p.userId,
    service: service(p.service),
    amount: Number(p.amount),
    status: p.status,
    dueDate: p.dueDate.toISOString(),
    paidAt: iso(p.paidAt),
  };
}

export function toScript(s: DbScript): Script {
  return {
    id: s.id,
    title: s.title,
    category: s.category ?? "General",
    body: s.body,
    active: s.active,
    createdById: s.createdById ?? "",
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function toField(f: DbField): CustomFieldDef {
  return {
    id: f.id,
    key: f.key,
    name: f.name,
    type: f.type,
    options: Array.isArray(f.options) ? (f.options as string[]) : [],
    required: f.required,
    active: f.active,
  };
}

export function toPool(p: DbPool): Pool {
  return { id: p.id, name: p.name, description: p.description ?? "" };
}

export function toTimeLog(t: DbTimeLog): TimeLog {
  return { id: t.id, userId: t.userId, clockIn: t.clockIn.toISOString(), clockOut: iso(t.clockOut) };
}

export function toImport(i: DbImport): CsvImport {
  return {
    id: i.id,
    fileName: i.fileName,
    rowCount: i.rowCount,
    successCount: i.successCount,
    duplicateCount: i.duplicateCount,
    errorCount: i.errorCount,
    uploadedById: i.uploadedById ?? "",
    poolId: i.poolId,
    createdAt: i.createdAt.toISOString(),
  };
}
