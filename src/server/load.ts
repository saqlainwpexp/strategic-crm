// Loads everything the signed-in user may see, scoped by role on the server.

import { prisma } from "./db";
import { visibleUserIds } from "./session";
import { getSettings } from "./settings";
import { toCall, toField, toImport, toLead, toMeeting, toPayment, toPool, toScript, toTimeLog, toUser } from "./mappers";
import type { CrmData, User } from "@/lib/types";

const DAY = 24 * 60 * 60 * 1000;
/** Enough history for "last 30 days vs previous 30 days" reporting. */
const ACTIVITY_DAYS = 70;
const MEETING_DAYS = 120;

export async function loadCrmData(viewer: User): Promise<{ data: CrmData; allUsers: User[] }> {
  const ids = await visibleUserIds(viewer);
  const mine = ids ? { in: [...ids] } : undefined;
  const since = new Date(Date.now() - ACTIVITY_DAYS * DAY);
  const meetingsSince = new Date(Date.now() - MEETING_DAYS * DAY);
  const manager = viewer.role === "MANAGER" || viewer.role === "SUPER_ADMIN";

  const [users, leads, scripts, customFields, pools, settings] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.lead.findMany({ where: ids ? { assignedToId: mine } : {}, orderBy: { leadScore: "desc" } }),
    prisma.script.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.customFieldDef.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    prisma.pool.findMany({ orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  const leadIds = ids ? leads.map((l) => l.id) : undefined;

  const [calls, meetings, payments, timeLogs, imports] = await Promise.all([
    prisma.callLog.findMany({
      where: { startedAt: { gte: since }, ...(ids ? { userId: mine, leadId: { in: leadIds } } : {}) },
      orderBy: { startedAt: "asc" },
    }),
    prisma.meeting.findMany({ where: { scheduledAt: { gte: meetingsSince }, ...(ids ? { userId: mine } : {}) }, orderBy: { scheduledAt: "asc" } }),
    prisma.payment.findMany({ where: ids ? { userId: mine } : {}, orderBy: { createdAt: "asc" } }),
    prisma.timeLog.findMany({ where: { clockIn: { gte: since }, ...(ids ? { userId: mine } : {}) }, orderBy: { clockIn: "asc" } }),
    manager ? prisma.csvImport.findMany({ orderBy: { createdAt: "desc" }, take: 50 }) : Promise.resolve([]),
  ]);

  const all = users.map(toUser);
  // Team members the viewer may see in full (plus their own manager, so names resolve).
  const scopedUsers = ids ? all.filter((u) => ids.has(u.id) || u.id === viewer.reportsToId) : all;
  // Everyone else is visible by name/role only (for "assigned to" labels) — no emails.
  const allUsers = all.map((u) => (ids && !ids.has(u.id) && !manager ? { ...u, email: "" } : u));

  return {
    data: {
      users: scopedUsers,
      leads: leads.map(toLead),
      calls: calls.map(toCall),
      meetings: meetings.map(toMeeting),
      payments: payments.map(toPayment),
      scripts: scripts.map(toScript),
      customFields: customFields.map(toField),
      pools: pools.map(toPool),
      timeLogs: timeLogs.map(toTimeLog),
      imports: imports.map(toImport),
      settings,
    },
    allUsers,
  };
}
