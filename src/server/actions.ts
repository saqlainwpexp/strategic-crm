"use server";

// Every write goes through here. Each action: (1) requires a signed-in user, (2) validates
// input, (3) checks the role is allowed, and (4) checks the record is in the user's scope.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";
import { AuthError, requireActionUser, visibleUserIds } from "./session";
import { BCRYPT_ROUNDS, MIN_PASSWORD_LENGTH } from "./auth";
import { normalizeSettings, saveBrandingRow, saveSettingsRow } from "./settings";
import { fireTrigger } from "./email/triggers";
import { normalizeTags } from "@/lib/email";
import { permissionsFor } from "@/lib/access";
import { normalizeBranding, type Branding } from "@/lib/branding";
import { AGENCY_SERVICES, DISPOSITIONS, DISPOSITION_TO_STAGE, PIPELINE_STAGES, PRIORITIES, type PipelineStage } from "@/lib/constants";
import type { Settings, User } from "@/lib/types";

// ─── Result plumbing ─────────────────────────────────────────

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

class Forbidden extends Error {}
class NotFound extends Error {}
class Invalid extends Error {}

async function run<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    if (e instanceof Forbidden) return { ok: false, error: e.message || "You don't have permission to do that." };
    if (e instanceof NotFound) return { ok: false, error: e.message || "That record no longer exists." };
    if (e instanceof Invalid) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Some of the details aren't valid. Please check and try again." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return { ok: false, error: "That already exists (duplicate value)." };
    console.error(`[action:${name}]`, e);
    return { ok: false, error: "Something went wrong saving that. Please try again." };
  }
}

// ─── Validation ──────────────────────────────────────────────

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const str = (max: number) => z.string().max(max);
const isoDate = z.string().datetime({ offset: true });
const customValue = z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]);

const leadFields = z.object({
  businessName: str(200).min(1),
  address: str(500),
  city: str(120),
  website: str(300),
  issues: str(4000),
  suggestedServices: str(4000),
  phone: str(40),
  email: str(254),
  priority: z.enum(PRIORITIES as unknown as [string, ...string[]]),
  source: str(120),
  decisionMakerName: str(200),
  leadScore: z.number().int().min(0).max(100),
  stage: z.enum(PIPELINE_STAGES as unknown as [string, ...string[]]),
  service: z.enum(AGENCY_SERVICES as unknown as [string, ...string[]]),
  estimatedValue: z.number().min(0).max(1e12),
  assignedToId: id.nullable(),
  poolId: id.nullable(),
  notes: str(8000),
  customFields: z.record(str(60), customValue).refine((o) => Object.keys(o).length <= 60),
  lastContactedAt: isoDate.nullable(),
  nextFollowUpAt: isoDate.nullable(),
  closedAt: isoDate.nullable(),
});
const leadPatch = leadFields.partial();
type LeadPatch = z.infer<typeof leadPatch>;

/** Validated lead fields → Prisma data (empty strings stored as NULL). */
function leadData(p: LeadPatch) {
  const d: Prisma.LeadUncheckedUpdateInput = {};
  const optStr = ["address", "city", "website", "issues", "suggestedServices", "phone", "email", "source", "decisionMakerName", "notes"] as const;
  for (const k of optStr) if (p[k] !== undefined) d[k] = p[k]!.trim() || null;
  if (p.businessName !== undefined) d.businessName = p.businessName.trim();
  if (p.priority !== undefined) d.priority = p.priority as Prisma.LeadUncheckedUpdateInput["priority"];
  if (p.stage !== undefined) d.stage = p.stage as PipelineStage;
  if (p.service !== undefined) d.service = p.service;
  if (p.leadScore !== undefined) d.leadScore = p.leadScore;
  if (p.estimatedValue !== undefined) d.estimatedValue = p.estimatedValue;
  if (p.assignedToId !== undefined) d.assignedToId = p.assignedToId;
  if (p.poolId !== undefined) d.poolId = p.poolId;
  if (p.customFields !== undefined) d.customFields = p.customFields as Prisma.InputJsonObject;
  if (p.lastContactedAt !== undefined) d.lastContactedAt = p.lastContactedAt ? new Date(p.lastContactedAt) : null;
  if (p.nextFollowUpAt !== undefined) d.nextFollowUpAt = p.nextFollowUpAt ? new Date(p.nextFollowUpAt) : null;
  if (p.closedAt !== undefined) d.closedAt = p.closedAt ? new Date(p.closedAt) : null;
  return d;
}

// ─── Scope checks ────────────────────────────────────────────

function inScope(ids: Set<string> | null, userId: string | null) {
  return ids === null || (userId !== null && ids.has(userId));
}

async function leadInScope(me: User, leadId: string) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true, stage: true, notes: true } });
  if (!lead) throw new NotFound();
  if (!inScope(await visibleUserIds(me), lead.assignedToId)) throw new Forbidden();
  return lead;
}

/** Who `me` may assign a lead to. Sales: only themselves. BD: themselves + reps. Managers: anyone active. */
async function assertAssignable(me: User, assigneeId: string | null) {
  if (assigneeId === null) {
    if (!permissionsFor(me.role).importLeads) throw new Forbidden("Only managers can unassign leads.");
    return;
  }
  const ids = await visibleUserIds(me);
  if (!inScope(ids, assigneeId)) throw new Forbidden("You can't assign leads to that person.");
  const u = await prisma.user.findUnique({ where: { id: assigneeId }, select: { active: true } });
  if (!u?.active) throw new Invalid("That user isn't active.");
}

async function assertPool(poolId: string | null | undefined) {
  if (!poolId) return;
  if (!(await prisma.pool.findUnique({ where: { id: poolId }, select: { id: true } }))) throw new Invalid("That lead pool doesn't exist.");
}

const closedAtFor = (stage: string, current: Date | null) => (stage === "CLOSED_WON" ? current ?? new Date() : null);

// ─── Leads ───────────────────────────────────────────────────

export async function updateLeadAction(leadId: string, patch: LeadPatch) {
  return run("updateLead", async () => {
    const me = await requireActionUser();
    const lid = id.parse(leadId);
    const p = leadPatch.parse(patch);
    const before = await leadInScope(me, lid);
    if (p.assignedToId !== undefined || p.poolId !== undefined) {
      if (!permissionsFor(me.role).assignLeads) throw new Forbidden("You can't reassign leads.");
      if (p.assignedToId !== undefined) await assertAssignable(me, p.assignedToId);
      await assertPool(p.poolId);
    }
    const data = leadData(p);
    if (p.stage !== undefined) {
      const current = await prisma.lead.findUnique({ where: { id: lid }, select: { closedAt: true } });
      data.closedAt = closedAtFor(p.stage, current?.closedAt ?? null);
    }
    await prisma.lead.update({ where: { id: lid }, data });
    if (p.stage !== undefined && p.stage !== before.stage) await fireTrigger("STAGE_CHANGED", [lid], p.stage);
  });
}

export async function moveLeadAction(leadId: string, stage: string) {
  return updateLeadAction(leadId, { stage });
}

export async function createLeadAction(input: { id: string } & z.infer<typeof leadFields>) {
  return run("createLead", async () => {
    const me = await requireActionUser();
    const newId = id.parse(input.id);
    const p = leadFields.parse(input);
    // Sales reps always own the leads they add.
    const assignee = me.role === "SALES" ? me.id : p.assignedToId;
    await assertAssignable(me, assignee);
    await assertPool(p.poolId);
    await prisma.lead.create({
      data: {
        ...(leadData({ ...p, assignedToId: assignee }) as Prisma.LeadUncheckedCreateInput),
        id: newId,
        businessName: p.businessName.trim(),
        closedAt: p.stage === "CLOSED_WON" ? new Date() : null,
      },
    });
    await fireTrigger("LEAD_CREATED", [newId]);
  });
}

const MAX_IMPORT_ROWS = 5000;

export async function importLeadsAction(
  rows: ({ id: string } & z.infer<typeof leadFields>)[],
  meta: { fileName: string; rowCount: number; duplicateCount: number; errorCount: number; poolId: string | null },
  tags: string[] = []
) {
  return run("importLeads", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).importLeads) throw new Forbidden();
    if (!Array.isArray(rows) || rows.length > MAX_IMPORT_ROWS) throw new Invalid(`Import at most ${MAX_IMPORT_ROWS} leads at a time.`);
    const m = z
      .object({
        fileName: str(200),
        rowCount: z.number().int().min(0).max(100000),
        duplicateCount: z.number().int().min(0).max(100000),
        errorCount: z.number().int().min(0).max(100000),
        poolId: id.nullable(),
      })
      .parse(meta);
    await assertPool(m.poolId);
    const parsed = rows.map((r) => ({ id: id.parse(r.id), ...leadFields.parse(r) }));
    for (const a of new Set(parsed.map((r) => r.assignedToId))) await assertAssignable(me, a);

    const result = await prisma.lead.createMany({
      data: parsed.map((r) => ({
        ...(leadData(r) as Prisma.LeadCreateManyInput),
        id: r.id,
        businessName: r.businessName.trim(),
        stage: "LEAD" as PipelineStage,
        closedAt: null,
      })),
      skipDuplicates: true,
    });
    const imp = await prisma.csvImport.create({
      data: { ...m, successCount: result.count, uploadedById: me.id },
    });
    await audit(me.id, "leads.import", "CsvImport", imp.id, { count: result.count, fileName: m.fileName });
    const created = await prisma.lead.findMany({ where: { id: { in: parsed.map((r) => r.id) } }, select: { id: true } });
    const createdIds = created.map((l) => l.id);
    const importTags = normalizeTags(z.array(str(40)).max(5).parse(tags));
    if (importTags.length && createdIds.length) {
      await prisma.lead.updateMany({ where: { id: { in: createdIds } }, data: { tags: importTags } });
      for (const t of importTags) await fireTrigger("TAG_ADDED", createdIds, t);
    }
    await fireTrigger("LEAD_CREATED", createdIds);
    return { imported: result.count };
  });
}

export async function assignLeadsAction(leadIds: string[], patch: { assignedToId?: string | null; poolId?: string | null }) {
  return run("assignLeads", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).assignLeads) throw new Forbidden();
    const ids = z.array(id).min(1).max(5000).parse(leadIds);
    const p = z.object({ assignedToId: id.nullable().optional(), poolId: id.nullable().optional() }).parse(patch);
    if (p.assignedToId !== undefined) await assertAssignable(me, p.assignedToId);
    await assertPool(p.poolId);
    const scope = await visibleUserIds(me);
    const res = await prisma.lead.updateMany({
      where: { id: { in: ids }, ...(scope ? { assignedToId: { in: [...scope] } } : {}) },
      data: { ...(p.assignedToId !== undefined ? { assignedToId: p.assignedToId } : {}), ...(p.poolId !== undefined ? { poolId: p.poolId } : {}) },
    });
    if (res.count !== ids.length) throw new Forbidden("Some of those leads aren't yours to change.");
    await audit(me.id, "leads.assign", "Lead", undefined, { count: res.count, ...p });
  });
}

// ─── Calls ───────────────────────────────────────────────────

export async function logCallAction(input: {
  id: string;
  leadId: string;
  durationSec: number;
  disposition: string;
  scriptId: string | null;
  notes: string;
  followUpAt?: string | null;
}) {
  return run("logCall", async () => {
    const me = await requireActionUser();
    const c = z
      .object({
        id,
        leadId: id,
        durationSec: z.number().int().min(0).max(6 * 3600),
        disposition: z.enum(DISPOSITIONS as unknown as [string, ...string[]]),
        scriptId: id.nullable(),
        notes: str(4000),
        followUpAt: isoDate.nullable().optional(),
      })
      .parse(input);
    const lead = await leadInScope(me, c.leadId);
    const now = new Date();
    const nextStage = DISPOSITION_TO_STAGE[c.disposition as keyof typeof DISPOSITION_TO_STAGE];
    const notes = c.notes.trim();
    await prisma.$transaction([
      prisma.callLog.create({
        data: {
          id: c.id,
          leadId: c.leadId,
          userId: me.id,
          startedAt: new Date(now.getTime() - c.durationSec * 1000),
          endedAt: now,
          durationSec: c.durationSec,
          disposition: c.disposition as Prisma.CallLogUncheckedCreateInput["disposition"],
          scriptId: c.scriptId,
          notes: notes || null,
        },
      }),
      prisma.lead.update({
        where: { id: c.leadId },
        data: {
          ...(nextStage ? { stage: nextStage, closedAt: closedAtFor(nextStage, null) } : {}),
          lastContactedAt: now,
          ...(c.followUpAt !== undefined
            ? { nextFollowUpAt: c.followUpAt ? new Date(c.followUpAt) : null }
            : c.disposition === "NOT_INTERESTED" || c.disposition === "MEETING_BOOKED"
              ? { nextFollowUpAt: null }
              : {}),
          ...(notes ? { notes: lead.notes ? `${notes}\n${lead.notes}`.slice(0, 8000) : notes } : {}),
        },
      }),
    ]);
    if (nextStage && nextStage !== lead.stage) await fireTrigger("STAGE_CHANGED", [c.leadId], nextStage);
  });
}

// ─── Meetings ────────────────────────────────────────────────

const MEETING_TYPES = ["DISCOVERY", "FOLLOW_UP", "PROPOSAL", "ONBOARDING"] as const;
const MEETING_STATUSES = ["BOOKED", "SHOWED", "NO_SHOW", "CANCELLED"] as const;

export async function createMeetingAction(input: {
  id: string;
  leadId: string;
  userId: string;
  title: string;
  type: string;
  scheduledAt: string;
  durationMin: number;
  status: string;
  notes: string;
}) {
  return run("createMeeting", async () => {
    const me = await requireActionUser();
    const m = z
      .object({
        id,
        leadId: id,
        userId: id,
        title: str(120).min(1),
        type: z.enum(MEETING_TYPES),
        scheduledAt: isoDate,
        durationMin: z.number().int().min(5).max(480),
        status: z.enum(MEETING_STATUSES),
        notes: str(4000),
      })
      .parse(input);
    const lead = await leadInScope(me, m.leadId);
    if (!inScope(await visibleUserIds(me), m.userId)) throw new Forbidden("You can't book meetings for that person.");
    const advance = ["LEAD", "CONTACTED", "INTERESTED", "CALL_ME_LATER", "NO_SHOW"].includes(lead.stage);
    await prisma.$transaction([
      prisma.meeting.create({ data: { ...m, scheduledAt: new Date(m.scheduledAt), notes: m.notes || null } }),
      ...(advance ? [prisma.lead.update({ where: { id: m.leadId }, data: { stage: "MEETING_BOOKED" } })] : []),
    ]);
    if (advance) await fireTrigger("STAGE_CHANGED", [m.leadId], "MEETING_BOOKED");
  });
}

export async function updateMeetingAction(meetingId: string, patch: { status?: string; scheduledAt?: string; notes?: string }) {
  return run("updateMeeting", async () => {
    const me = await requireActionUser();
    const mid = id.parse(meetingId);
    const p = z.object({ status: z.enum(MEETING_STATUSES).optional(), scheduledAt: isoDate.optional(), notes: str(4000).optional() }).parse(patch);
    const meeting = await prisma.meeting.findUnique({ where: { id: mid }, select: { userId: true, leadId: true } });
    if (!meeting) throw new NotFound();
    if (!inScope(await visibleUserIds(me), meeting.userId)) throw new Forbidden();
    const stage = p.status === "SHOWED" ? "SHOWED" : p.status === "NO_SHOW" ? "NO_SHOW" : null;
    await prisma.$transaction([
      prisma.meeting.update({
        where: { id: mid },
        data: { ...p, ...(p.scheduledAt ? { scheduledAt: new Date(p.scheduledAt) } : {}) },
      }),
      ...(stage
        ? [prisma.lead.updateMany({ where: { id: meeting.leadId, stage: { not: "CLOSED_WON" } }, data: { stage } })]
        : []),
    ]);
    if (stage) await fireTrigger("STAGE_CHANGED", [meeting.leadId], stage);
  });
}

// ─── Payments ────────────────────────────────────────────────

export async function createPaymentAction(input: {
  id: string;
  leadId: string;
  userId: string;
  service: string;
  amount: number;
  status: string;
  dueDate: string;
  paidAt: string | null;
}) {
  return run("createPayment", async () => {
    const me = await requireActionUser();
    const p = z
      .object({
        id,
        leadId: id,
        userId: id,
        service: z.enum(AGENCY_SERVICES as unknown as [string, ...string[]]),
        amount: z.number().positive().max(1e12),
        status: z.enum(["PENDING", "PARTIAL", "PAID", "REFUNDED"]),
        dueDate: isoDate,
        paidAt: isoDate.nullable(),
      })
      .parse(input);
    await leadInScope(me, p.leadId);
    if (!inScope(await visibleUserIds(me), p.userId)) throw new Forbidden();
    // Invoice numbers are assigned on the server so they stay unique and sequential.
    const year = new Date().getFullYear();
    const count = await prisma.payment.count({ where: { invoiceNo: { startsWith: `INV-${year}-` } } });
    const invoiceNo = `INV-${year}-${String(count + 1).padStart(4, "0")}`;
    await prisma.payment.create({
      data: { ...p, invoiceNo, dueDate: new Date(p.dueDate), paidAt: p.paidAt ? new Date(p.paidAt) : null },
    });
    await audit(me.id, "payment.create", "Payment", p.id, { amount: p.amount, status: p.status });
    return { invoiceNo };
  });
}

export async function updatePaymentAction(paymentId: string, patch: { status?: string; paidAt?: string | null }) {
  return run("updatePayment", async () => {
    const me = await requireActionUser();
    const pid = id.parse(paymentId);
    const p = z.object({ status: z.enum(["PENDING", "PARTIAL", "PAID", "REFUNDED"]).optional(), paidAt: isoDate.nullable().optional() }).parse(patch);
    const payment = await prisma.payment.findUnique({ where: { id: pid }, select: { userId: true } });
    if (!payment) throw new NotFound();
    if (!inScope(await visibleUserIds(me), payment.userId)) throw new Forbidden();
    await prisma.payment.update({
      where: { id: pid },
      data: { ...(p.status ? { status: p.status } : {}), ...(p.paidAt !== undefined ? { paidAt: p.paidAt ? new Date(p.paidAt) : null } : {}) },
    });
    await audit(me.id, "payment.update", "Payment", pid, p);
  });
}

// ─── Scripts, custom fields, pools, settings ─────────────────

export async function saveScriptAction(input: { id?: string; title: string; category: string; body: string; active: boolean }) {
  return run("saveScript", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).editScripts) throw new Forbidden();
    const s = z
      .object({ id: id.optional(), title: str(160).min(1), category: str(60), body: str(20000).min(1), active: z.boolean() })
      .parse(input);
    const data = { title: s.title.trim(), category: s.category, body: s.body, active: s.active };
    if (s.id && (await prisma.script.findUnique({ where: { id: s.id }, select: { id: true } }))) {
      await prisma.script.update({ where: { id: s.id }, data });
    } else {
      await prisma.script.create({ data: { ...data, ...(s.id ? { id: s.id } : {}), createdById: me.id } });
    }
  });
}

export async function saveCustomFieldAction(input: {
  id?: string;
  key: string;
  name: string;
  type: string;
  options: string[];
  required: boolean;
  active: boolean;
}) {
  return run("saveCustomField", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).admin) throw new Forbidden();
    const f = z
      .object({
        id: id.optional(),
        key: z.string().min(1).max(40).regex(/^[a-z0-9_]+$/),
        name: str(80).min(1),
        type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN", "URL"]),
        options: z.array(str(80)).max(100),
        required: z.boolean(),
        active: z.boolean(),
      })
      .parse(input);
    const data = { name: f.name.trim(), type: f.type, options: f.options, required: f.required, active: f.active };
    if (f.id && (await prisma.customFieldDef.findUnique({ where: { id: f.id }, select: { id: true } }))) {
      // The key is fixed once created — lead data is stored under it.
      await prisma.customFieldDef.update({ where: { id: f.id }, data });
    } else {
      await prisma.customFieldDef.create({ data: { ...data, ...(f.id ? { id: f.id } : {}), key: f.key } });
    }
    await audit(me.id, "settings.custom_field", "CustomFieldDef", f.id, { key: f.key });
  });
}

export async function savePoolAction(input: { id?: string; name: string; description: string }) {
  return run("savePool", async () => {
    const me = await requireActionUser();
    // Super admin manages pools; managers may create one while importing.
    if (!permissionsFor(me.role).importLeads) throw new Forbidden();
    const p = z.object({ id: id.optional(), name: str(120).min(1), description: str(1000) }).parse(input);
    const data = { name: p.name.trim(), description: p.description.trim() || null };
    if (p.id && (await prisma.pool.findUnique({ where: { id: p.id }, select: { id: true } }))) {
      if (!permissionsFor(me.role).admin) throw new Forbidden();
      await prisma.pool.update({ where: { id: p.id }, data });
    } else {
      await prisma.pool.create({ data: { ...data, ...(p.id ? { id: p.id } : {}) } });
    }
  });
}

export async function updateSettingsAction(input: Partial<Settings>) {
  return run("updateSettings", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).admin) throw new Forbidden();
    const current = await prisma.setting.findUnique({ where: { key: "settings" } });
    const merged = normalizeSettings({ ...((current?.value as object) ?? {}), ...input });
    await saveSettingsRow(merged);
    await audit(me.id, "settings.update", "Setting", "settings");
    revalidatePath("/", "layout");
    return merged;
  });
}

export async function saveBrandingAction(input: Branding | null) {
  return run("saveBranding", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).admin) throw new Forbidden("Only the super admin can change branding.");
    const b = normalizeBranding(input ?? {});
    await saveBrandingRow(b);
    await audit(me.id, "settings.branding", "Setting", "branding");
    revalidatePath("/", "layout");
    return b;
  });
}

// ─── Team / users ────────────────────────────────────────────

export async function saveUserAction(input: {
  id?: string;
  name: string;
  email: string;
  role: string;
  title: string;
  reportsToId: string | null;
  active: boolean;
  password?: string;
}) {
  return run("saveUser", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).manageUsers) throw new Forbidden();
    const u = z
      .object({
        id: id.optional(),
        name: str(120).min(1),
        email: z.string().email().max(254),
        role: z.enum(["SALES", "BD", "MANAGER", "SUPER_ADMIN"]),
        title: str(120),
        reportsToId: id.nullable(),
        active: z.boolean(),
        password: z.string().min(MIN_PASSWORD_LENGTH).max(200).optional(),
      })
      .parse(input);
    const email = u.email.trim().toLowerCase();
    const existing = u.id ? await prisma.user.findUnique({ where: { id: u.id } }) : null;

    // Only a super admin can create, edit or promote to super admin.
    if (me.role !== "SUPER_ADMIN" && (u.role === "SUPER_ADMIN" || existing?.role === "SUPER_ADMIN")) throw new Forbidden();
    // Nobody can lock themselves out by deactivating or demoting their own account.
    if (existing?.id === me.id && (!u.active || u.role !== me.role)) throw new Invalid("You can't deactivate or change the role of your own account.");
    if (u.reportsToId) {
      if (u.reportsToId === u.id) throw new Invalid("Someone can't report to themselves.");
      if (!(await prisma.user.findUnique({ where: { id: u.reportsToId }, select: { id: true } }))) throw new Invalid("Unknown manager.");
    }

    const base = { name: u.name.trim(), email, role: u.role, title: u.title.trim(), reportsToId: u.reportsToId, active: u.active };
    const pw = u.password ? { passwordHash: await bcrypt.hash(u.password, BCRYPT_ROUNDS), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } : {};

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { ...base, ...pw } });
      await audit(me.id, "user.update", "User", existing.id, {
        roleFrom: existing.role,
        roleTo: u.role,
        active: u.active,
        passwordReset: !!u.password,
      });
    } else {
      if (!u.password) throw new Invalid(`Set a temporary password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      const created = await prisma.user.create({ data: { ...base, ...(pw as { passwordHash: string }), ...(u.id ? { id: u.id } : {}) } });
      await audit(me.id, "user.create", "User", created.id, { role: u.role });
    }
  });
}

export async function changeOwnPasswordAction(currentPassword: string, newPassword: string) {
  return run("changePassword", async () => {
    const me = await requireActionUser();
    const p = z.object({ current: z.string().min(1).max(200), next: z.string().min(MIN_PASSWORD_LENGTH).max(200) }).parse({ current: currentPassword, next: newPassword });
    const user = await prisma.user.findUnique({ where: { id: me.id } });
    if (!user || !(await bcrypt.compare(p.current, user.passwordHash))) throw new Invalid("Your current password isn't right.");
    if (p.current === p.next) throw new Invalid("Choose a password different from your current one.");
    await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await bcrypt.hash(p.next, BCRYPT_ROUNDS), passwordChangedAt: new Date() } });
    await audit(me.id, "user.password_change", "User", me.id);
  });
}

// ─── Shifts ──────────────────────────────────────────────────

export async function clockInAction() {
  return run("clockIn", async () => {
    const me = await requireActionUser();
    const open = await prisma.timeLog.findFirst({ where: { userId: me.id, clockOut: null } });
    if (open) return { id: open.id, clockIn: open.clockIn.toISOString() };
    const t = await prisma.timeLog.create({ data: { userId: me.id } });
    return { id: t.id, clockIn: t.clockIn.toISOString() };
  });
}

export async function clockOutAction() {
  return run("clockOut", async () => {
    const me = await requireActionUser();
    const open = await prisma.timeLog.findMany({ where: { userId: me.id, clockOut: null } });
    const now = new Date();
    await prisma.$transaction(
      open.map((t) =>
        prisma.timeLog.update({
          where: { id: t.id },
          data: { clockOut: now, durationSec: Math.round((now.getTime() - t.clockIn.getTime()) / 1000) },
        })
      )
    );
    return { clockOut: now.toISOString() };
  });
}

/**
 * Permanently delete leads — from both the Cold Calling CRM and Email Marketing.
 * Their calls, meetings, payments and workflow enrolments go too; sent-email stats and
 * inbox replies are kept but no longer linked to a lead. Managers and super admin only.
 */
export async function deleteLeadsAction(leadIds: string[]) {
  return run("deleteLeads", async () => {
    const me = await requireActionUser();
    if (!permissionsFor(me.role).deleteLeads) throw new Forbidden("Only managers can delete leads.");
    const ids = z.array(id).min(1).max(5000).parse(leadIds);
    const doomed = await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, businessName: true } });
    const res = await prisma.lead.deleteMany({ where: { id: { in: doomed.map((l) => l.id) } } });
    await audit(me.id, "leads.delete", "Lead", doomed.length === 1 ? doomed[0].id : undefined, {
      count: res.count,
      names: doomed.slice(0, 25).map((l) => l.businessName),
    });
    revalidatePath("/", "layout");
    return { deleted: res.count };
  });
}
