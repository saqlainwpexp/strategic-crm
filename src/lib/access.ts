// Role permissions shared by the UI and the server. Data scoping (who sees which records)
// is enforced in the database queries — see src/server/session.ts and src/server/load.ts.

import type { Role } from "./types";

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
    /** Email marketing (campaigns, automations, inbox, sending accounts). */
    emailMarketing: manager,
    /** Super Admin only: branding, custom fields, pools, settings. */
    admin: role === "SUPER_ADMIN",
  };
}
