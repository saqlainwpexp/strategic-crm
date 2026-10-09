// Read-side queries for the email-marketing pages. Callers must have checked the
// emailMarketing permission (see requireEmailPage in ./access.ts).

import { Prisma, type Automation, type Campaign, type EmailAccount, type EmailDomain } from "@prisma/client";
import { prisma } from "../db";
import { normalizeAudience, normalizeSteps, normalizeTags, stringArray, type AutomationTrigger, type ContactStatus } from "@/lib/email";
import type {
  AudienceOptions,
  AutomationView,
  CampaignView,
  ContactActivity,
  ContactView,
  DomainCheck,
  EmailAccountView,
  EmailDomainView,
  EmailOverview,
  EnrollmentView,
  RecipientView,
  SendStats,
  TemplateView,
  ThreadMessage,
  ThreadSummary,
} from "@/lib/email-types";
import type { PipelineStage } from "@/lib/constants";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const n = (v: unknown) => Number(v ?? 0);

export const EMPTY_STATS: SendStats = { total: 0, queued: 0, sent: 0, failed: 0, skipped: 0, opened: 0, clicked: 0, replied: 0, bounced: 0 };

type StatRow = { k: string | null; total: unknown; queued: unknown; sent: unknown; failed: unknown; skipped: unknown; opened: unknown; clicked: unknown; replied: unknown; bounced: unknown };

const STAT_COLUMNS = Prisma.sql`COUNT(*) AS total,
  SUM(status IN ('QUEUED','SENDING')) AS queued,
  SUM(status = 'SENT') AS sent,
  SUM(status = 'FAILED') AS failed,
  SUM(status = 'SKIPPED') AS skipped,
  SUM(openedAt IS NOT NULL) AS opened,
  SUM(clickedAt IS NOT NULL) AS clicked,
  SUM(repliedAt IS NOT NULL) AS replied,
  SUM(bouncedAt IS NOT NULL) AS bounced`;

const toStats = (r?: StatRow): SendStats =>
  r
    ? { total: n(r.total), queued: n(r.queued), sent: n(r.sent), failed: n(r.failed), skipped: n(r.skipped), opened: n(r.opened), clicked: n(r.clicked), replied: n(r.replied), bounced: n(r.bounced) }
    : { ...EMPTY_STATS };

async function statsBy(column: "campaignId" | "automationId", ids: string[]) {
  if (!ids.length) return new Map<string, SendStats>();
  const col = Prisma.raw(`\`${column}\``);
  const rows = await prisma.$queryRaw<StatRow[]>`SELECT ${col} AS k, ${STAT_COLUMNS} FROM \`EmailSend\` WHERE ${col} IN (${Prisma.join(ids)}) GROUP BY ${col}`;
  return new Map(rows.map((r) => [r.k ?? "", toStats(r)]));
}

// ─── Accounts & domains ──────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

export function toAccountView(a: EmailAccount, totalSent = 0): EmailAccountView {
  return {
    id: a.id,
    name: a.name,
    email: a.email,
    fromName: a.fromName,
    provider: a.provider,
    smtpHost: a.smtpHost,
    smtpPort: a.smtpPort,
    smtpUser: a.smtpUser,
    imapEnabled: a.imapEnabled,
    imapHost: a.imapHost,
    imapPort: a.imapPort,
    dailyLimit: a.dailyLimit,
    minDelaySec: a.minDelaySec,
    signature: a.signature,
    status: a.status,
    lastError: a.lastError,
    sentToday: a.sentDay === today() ? a.sentToday : 0,
    lastSyncAt: iso(a.lastSyncAt),
    totalSent,
  };
}

export async function loadAccounts(): Promise<EmailAccountView[]> {
  const [accounts, totals] = await Promise.all([
    prisma.emailAccount.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.emailSend.groupBy({ by: ["accountId"], where: { status: "SENT" }, _count: { _all: true } }),
  ]);
  const t = new Map(totals.map((r) => [r.accountId, r._count._all]));
  return accounts.map((a) => toAccountView(a, t.get(a.id) ?? 0));
}

const check = (v: string): DomainCheck => (v === "pass" || v === "fail" || v === "warn" ? v : "pending");

export function toDomainView(d: EmailDomain): EmailDomainView {
  return {
    id: d.id,
    domain: d.domain,
    spf: check(d.spfStatus),
    dkim: check(d.dkimStatus),
    dmarc: check(d.dmarcStatus),
    details: (d.details as EmailDomainView["details"]) ?? null,
    lastCheckedAt: iso(d.lastCheckedAt),
  };
}

export async function loadDomains(): Promise<EmailDomainView[]> {
  return (await prisma.emailDomain.findMany({ orderBy: { createdAt: "asc" } })).map(toDomainView);
}

// ─── Templates ───────────────────────────────────────────────

export async function loadTemplates(): Promise<TemplateView[]> {
  const rows = await prisma.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map((t) => ({ id: t.id, name: t.name, subject: t.subject, html: t.html, updatedAt: t.updatedAt.toISOString() }));
}

// ─── Campaigns ───────────────────────────────────────────────

function toCampaignView(c: Campaign, stats: SendStats): CampaignView {
  return {
    id: c.id,
    name: c.name,
    subject: c.subject,
    previewText: c.previewText,
    html: c.html,
    fromName: c.fromName,
    replyTo: c.replyTo,
    accountIds: stringArray(c.accountIds),
    audience: normalizeAudience(c.audience),
    trackOpens: c.trackOpens,
    trackClicks: c.trackClicks,
    addUnsubscribe: c.addUnsubscribe,
    status: c.status,
    scheduledAt: iso(c.scheduledAt),
    startedAt: iso(c.startedAt),
    finishedAt: iso(c.finishedAt),
    recipientCount: c.recipientCount,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    stats,
  };
}

export async function loadCampaigns(take = 200): Promise<CampaignView[]> {
  const rows = await prisma.campaign.findMany({ orderBy: { updatedAt: "desc" }, take });
  const stats = await statsBy("campaignId", rows.map((c) => c.id));
  return rows.map((c) => toCampaignView(c, stats.get(c.id) ?? { ...EMPTY_STATS }));
}

export async function loadCampaign(id: string): Promise<CampaignView | null> {
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) return null;
  const stats = await statsBy("campaignId", [c.id]);
  return toCampaignView(c, stats.get(c.id) ?? { ...EMPTY_STATS });
}

export async function loadRecipients(where: Prisma.EmailSendWhereInput, take = 500): Promise<RecipientView[]> {
  const rows = await prisma.emailSend.findMany({
    where,
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { queuedAt: "asc" }],
    take,
    include: { lead: { select: { businessName: true, decisionMakerName: true } }, account: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    leadId: r.leadId,
    businessName: r.lead?.businessName ?? "(deleted lead)",
    contactName: r.lead?.decisionMakerName ?? "",
    email: r.email,
    status: r.status,
    error: r.error,
    sentAt: iso(r.sentAt),
    openedAt: iso(r.openedAt),
    openCount: r.openCount,
    clickedAt: iso(r.clickedAt),
    repliedAt: iso(r.repliedAt),
    bouncedAt: iso(r.bouncedAt),
    accountEmail: r.account?.email ?? null,
  }));
}

// ─── Automations ─────────────────────────────────────────────

async function enrollmentCounts(ids: string[]) {
  if (!ids.length) return new Map<string, AutomationView["counts"]>();
  const rows = await prisma.automationEnrollment.groupBy({ by: ["automationId", "status"], where: { automationId: { in: ids } }, _count: { _all: true } });
  const m = new Map<string, AutomationView["counts"]>();
  for (const r of rows) {
    const c = m.get(r.automationId) ?? { active: 0, completed: 0, stopped: 0 };
    if (r.status === "ACTIVE") c.active = r._count._all;
    else if (r.status === "COMPLETED") c.completed = r._count._all;
    else c.stopped = r._count._all;
    m.set(r.automationId, c);
  }
  return m;
}

function toAutomationView(a: Automation, counts: AutomationView["counts"] | undefined, stats: SendStats | undefined): AutomationView {
  return {
    id: a.id,
    name: a.name,
    trigger: a.trigger as AutomationTrigger,
    triggerValue: a.triggerValue,
    steps: normalizeSteps(a.steps),
    accountIds: stringArray(a.accountIds),
    stopOnReply: a.stopOnReply,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    counts: counts ?? { active: 0, completed: 0, stopped: 0 },
    stats: stats ?? { ...EMPTY_STATS },
  };
}

export async function loadAutomations(): Promise<AutomationView[]> {
  const rows = await prisma.automation.findMany({ orderBy: { updatedAt: "desc" } });
  const ids = rows.map((a) => a.id);
  const [counts, stats] = await Promise.all([enrollmentCounts(ids), statsBy("automationId", ids)]);
  return rows.map((a) => toAutomationView(a, counts.get(a.id), stats.get(a.id)));
}

export async function loadAutomation(id: string) {
  const a = await prisma.automation.findUnique({ where: { id } });
  if (!a) return null;
  const [counts, stats, enrollments] = await Promise.all([
    enrollmentCounts([a.id]),
    statsBy("automationId", [a.id]),
    prisma.automationEnrollment.findMany({
      where: { automationId: a.id },
      orderBy: { enrolledAt: "desc" },
      take: 300,
      include: { lead: { select: { businessName: true, email: true } } },
    }),
  ]);
  return {
    automation: toAutomationView(a, counts.get(a.id), stats.get(a.id)),
    enrollments: enrollments.map(
      (e): EnrollmentView => ({
        id: e.id,
        leadId: e.leadId,
        businessName: e.lead.businessName,
        email: e.lead.email ?? "",
        stepIndex: e.stepIndex,
        status: e.status,
        stopReason: e.stopReason,
        nextRunAt: iso(e.nextRunAt),
        enrolledAt: e.enrolledAt.toISOString(),
      })
    ),
  };
}

// ─── Contacts ────────────────────────────────────────────────

export type ContactQuery = { q?: string; status?: string; tag?: string; stage?: string; page?: number; id?: string };

export const CONTACTS_PAGE_SIZE = 50;

function contactStatus(l: { email: string | null; emailOptOut: boolean; emailBouncedAt: Date | null }): ContactStatus {
  if (!(l.email ?? "").includes("@")) return "NO_EMAIL";
  if (l.emailOptOut) return "UNSUBSCRIBED";
  if (l.emailBouncedAt) return "BOUNCED";
  return "SUBSCRIBED";
}

export async function loadContacts(query: ContactQuery) {
  const and: Prisma.LeadWhereInput[] = [];
  if (query.id) and.push({ id: query.id });
  const q = query.q?.trim();
  if (q) and.push({ OR: [{ businessName: { contains: q } }, { decisionMakerName: { contains: q } }, { email: { contains: q } }, { city: { contains: q } }] });
  if (query.status === "SUBSCRIBED") and.push({ email: { contains: "@" }, emailOptOut: false, emailBouncedAt: null });
  else if (query.status === "UNSUBSCRIBED") and.push({ emailOptOut: true });
  else if (query.status === "BOUNCED") and.push({ emailBouncedAt: { not: null } });
  else if (query.status === "NO_EMAIL") and.push({ OR: [{ email: null }, { email: { not: { contains: "@" } } }] });
  if (query.tag) and.push({ tags: { array_contains: [query.tag] } });
  if (query.stage) and.push({ stage: query.stage as PipelineStage });
  const where: Prisma.LeadWhereInput = and.length ? { AND: and } : {};

  const page = Math.max(1, query.page ?? 1);
  const [total, rows, counts] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ lastEmailedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * CONTACTS_PAGE_SIZE,
      take: CONTACTS_PAGE_SIZE,
      select: {
        id: true, businessName: true, decisionMakerName: true, email: true, phone: true, city: true, stage: true, service: true,
        leadScore: true, tags: true, emailOptOut: true, emailBouncedAt: true, lastEmailedAt: true,
      },
    }),
    prisma.lead.groupBy({ by: ["emailOptOut"], _count: { _all: true } }),
  ]);
  const ids = rows.map((r) => r.id);
  const activity = ids.length
    ? await prisma.$queryRaw<{ k: string; sent: unknown; opened: unknown; replied: unknown }[]>`
        SELECT leadId AS k, SUM(status = 'SENT') AS sent, SUM(openedAt IS NOT NULL) AS opened, SUM(repliedAt IS NOT NULL) AS replied
        FROM \`EmailSend\` WHERE leadId IN (${Prisma.join(ids)}) GROUP BY leadId`
    : [];
  const act = new Map(activity.map((a) => [a.k, a]));

  const contacts: ContactView[] = rows.map((l) => ({
    id: l.id,
    businessName: l.businessName,
    contactName: l.decisionMakerName ?? "",
    email: l.email ?? "",
    phone: l.phone ?? "",
    city: l.city ?? "",
    stage: l.stage,
    service: l.service,
    leadScore: l.leadScore,
    tags: normalizeTags(l.tags),
    status: contactStatus(l),
    lastEmailedAt: iso(l.lastEmailedAt),
    sent: n(act.get(l.id)?.sent),
    opened: n(act.get(l.id)?.opened),
    replied: n(act.get(l.id)?.replied),
  }));
  const unsubscribed = counts.find((c) => c.emailOptOut)?._count._all ?? 0;
  return { contacts, total, page, pages: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)), unsubscribed };
}

export async function loadContactActivity(leadId: string): Promise<ContactActivity> {
  const [sends, enrollments] = await Promise.all([
    prisma.emailSend.findMany({
      where: { leadId },
      orderBy: { queuedAt: "desc" },
      take: 100,
      include: { campaign: { select: { name: true } }, automation: { select: { name: true } } },
    }),
    prisma.automationEnrollment.findMany({ where: { leadId }, orderBy: { enrolledAt: "desc" }, include: { automation: { select: { name: true } } } }),
  ]);
  return {
    sends: sends.map((s) => ({
      id: s.id,
      source: s.campaign?.name ?? (s.automation ? `${s.automation.name} · step ${(s.stepIndex ?? 0) + 1}` : "Email"),
      subject: s.subject,
      status: s.status,
      sentAt: iso(s.sentAt),
      openedAt: iso(s.openedAt),
      clickedAt: iso(s.clickedAt),
      repliedAt: iso(s.repliedAt),
      bouncedAt: iso(s.bouncedAt),
    })),
    enrollments: enrollments.map((e) => ({ id: e.id, automation: e.automation.name, status: e.status, stopReason: e.stopReason, enrolledAt: e.enrolledAt.toISOString() })),
  };
}

export async function loadAudienceOptions(): Promise<AudienceOptions> {
  const [tagRows, sources, cities, pools, reps] = await Promise.all([
    prisma.lead.findMany({ where: { NOT: { tags: { equals: Prisma.AnyNull } } }, select: { tags: true }, take: 20_000 }),
    prisma.lead.groupBy({ by: ["source"], where: { source: { not: null } }, orderBy: { source: "asc" } }),
    prisma.lead.groupBy({ by: ["city"], where: { city: { not: null } }, orderBy: { city: "asc" } }),
    prisma.pool.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const tags = new Set<string>();
  for (const r of tagRows) for (const t of normalizeTags(r.tags)) tags.add(t);
  return {
    tags: [...tags].sort((a, b) => a.localeCompare(b)),
    sources: sources.map((s) => s.source ?? "").filter(Boolean),
    cities: cities.map((c) => c.city ?? "").filter(Boolean),
    pools,
    reps,
  };
}

// ─── Inbox ───────────────────────────────────────────────────

export type InboxQuery = { folder?: string; account?: string; q?: string };

export async function loadThreads(query: InboxQuery): Promise<ThreadSummary[]> {
  const and: Prisma.InboxThreadWhereInput[] = [];
  if (query.folder === "archived") and.push({ archived: true });
  else and.push({ archived: false });
  if (query.folder === "unread") and.push({ unread: true });
  if (query.account) and.push({ accountId: query.account });
  const q = query.q?.trim();
  if (q) and.push({ OR: [{ subject: { contains: q } }, { contactEmail: { contains: q } }, { contactName: { contains: q } }, { lead: { businessName: { contains: q } } }] });

  const rows = await prisma.inboxThread.findMany({
    where: { AND: and },
    orderBy: { lastMessageAt: "desc" },
    take: 150,
    include: {
      account: { select: { email: true } },
      lead: { select: { businessName: true } },
      messages: { orderBy: { sentAt: "desc" }, take: 1, select: { text: true } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    subject: t.subject,
    contactEmail: t.contactEmail,
    contactName: t.contactName,
    businessName: t.lead?.businessName ?? null,
    leadId: t.leadId,
    accountId: t.accountId,
    accountEmail: t.account.email,
    unread: t.unread,
    archived: t.archived,
    lastMessageAt: t.lastMessageAt.toISOString(),
    snippet: (t.messages[0]?.text ?? "").replace(/\s+/g, " ").slice(0, 160),
  }));
}

export async function loadThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  const rows = await prisma.inboxMessage.findMany({ where: { threadId }, orderBy: { sentAt: "asc" }, take: 200 });
  return rows.map((m) => ({
    id: m.id,
    direction: m.direction,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    toEmail: m.toEmail,
    subject: m.subject,
    text: m.text,
    sentAt: m.sentAt.toISOString(),
  }));
}

export async function unreadThreadCount() {
  return prisma.inboxThread.count({ where: { unread: true, archived: false } });
}

// ─── Overview ────────────────────────────────────────────────

export async function loadOverview(days = 30): Promise<EmailOverview> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [statRows, daily, campaigns, accounts, activeAutomations, unreadReplies, unsubscribed, contacts, mailable] = await Promise.all([
    prisma.$queryRaw<StatRow[]>`SELECT NULL AS k, ${STAT_COLUMNS} FROM \`EmailSend\` WHERE sentAt >= ${since} OR (status IN ('QUEUED','SENDING'))`,
    prisma.$queryRaw<{ d: Date | string; sent: unknown; opened: unknown; replied: unknown }[]>`
      SELECT DATE(sentAt) AS d, COUNT(*) AS sent, SUM(openedAt IS NOT NULL) AS opened, SUM(repliedAt IS NOT NULL) AS replied
      FROM \`EmailSend\` WHERE sentAt >= ${since} AND status = 'SENT' GROUP BY DATE(sentAt) ORDER BY d`,
    loadCampaigns(6),
    loadAccounts(),
    prisma.automation.count({ where: { status: "ACTIVE" } }),
    unreadThreadCount(),
    prisma.lead.count({ where: { emailOptOut: true, unsubscribedAt: { gte: since } } }),
    prisma.lead.count({ where: { email: { contains: "@" } } }),
    prisma.lead.count({ where: { email: { contains: "@" }, emailOptOut: false, emailBouncedAt: null } }),
  ]);

  const byDay = new Map(
    daily.map((r) => [typeof r.d === "string" ? r.d.slice(0, 10) : r.d.toISOString().slice(0, 10), r])
  );
  const series: EmailOverview["daily"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(key);
    series.push({ day: key, sent: n(r?.sent), opened: n(r?.opened), replied: n(r?.replied) });
  }

  return {
    stats: { ...toStats(statRows[0]), unsubscribed, contacts, mailable },
    daily: series,
    campaigns,
    accounts,
    activeAutomations,
    unreadReplies,
  };
}
