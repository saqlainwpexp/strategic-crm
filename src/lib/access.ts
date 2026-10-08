// Role-based visibility rules. Every page reads data through scopeData(), and the same
// rules will become Prisma `where` clauses once the database is connected.

import type { CrmData, Role, User } from "./types";

/** Ids of users whose work the viewer can see, or null for "everyone". */
export function visibleUserIds(viewer: User, users: User[]): Set<string> | null {
  switch (viewer.role) {
    case "SALES":
      return new Set([viewer.id]);
    case "BD":
      return new Set([viewer.id, ...users.filter((u) => u.reportsToId === viewer.id).map((u) => u.id)]);
    default:
      return null; // MANAGER, SUPER_ADMIN
  }
}

export function scopeData(viewer: User, data: CrmData): CrmData {
  const ids = visibleUserIds(viewer, data.users);
  if (!ids) return data;

  const leads = data.leads.filter((l) => l.assignedToId !== null && ids.has(l.assignedToId));
  const leadIds = new Set(leads.map((l) => l.id));
  return {
    ...data,
    // Keep the viewer's own manager so names still resolve.
    users: data.users.filter((u) => ids.has(u.id) || u.id === viewer.reportsToId),
    leads,
    calls: data.calls.filter((c) => ids.has(c.userId) && leadIds.has(c.leadId)),
    meetings: data.meetings.filter((m) => ids.has(m.userId)),
    payments: data.payments.filter((p) => ids.has(p.userId)),
    timeLogs: data.timeLogs.filter((t) => ids.has(t.userId)),
    imports: [],
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;

export function permissionsFor(role: Role) {
  const manager = role === "MANAGER" || role === "SUPER_ADMIN";
  return {
    /** Sees more than their own leads (team or everyone). */
    seesTeam: role !== "SALES",
    viewAnalytics: manager,
    viewTeam: role !== "SALES",
    manageUsers: manager,
    importLeads: manager,
    assignLeads: role !== "SALES",
    editScripts: manager,
    /** Developer / Super Admin only: custom fields, pools, settings. */
    admin: role === "SUPER_ADMIN",
  };
}
