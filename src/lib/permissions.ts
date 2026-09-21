// Role-based access control. Roles grant named permissions; the server checks permissions
// on every call (src/server/auth/session.server.ts) and the UI uses the same map to decide
// what to show. Add a permission here rather than checking role names in feature code.
import type { RoleValue } from "./auth-constants";

export type Permission =
  | "orders.book"
  | "batches.manage"
  | "orders.manage"
  | "collections.manage"
  | "reports.view"
  | "roster.manage"
  | "delivery_points.manage"
  | "settings.manage"
  | "employee_accounts.manage"
  | "accounts.manage"
  | "account_audit.view"
  | "email_records.view"
  | "mailbox.send"
  | "staff.invite"
  | "staff.manage"
  | "employee_id.change";

const SYSTEM_ADMIN: Permission[] = [
  "batches.manage",
  "orders.manage",
  "collections.manage",
  "reports.view",
  "roster.manage",
  "delivery_points.manage",
  "settings.manage",
  "employee_accounts.manage",
  "account_audit.view",
  // Who was told about which batch, and whether it reached them.
  "email_records.view",
  // Writing to the Employee Database from the mailbox. Held by nobody else: an email that arrives
  // over the company's branding, addressed to everyone, is not a thing to hand out widely.
  "mailbox.send",
];

const GRANTS: Record<RoleValue, readonly Permission[]> = {
  employee: ["orders.book"],
  factory_operator: ["batches.manage", "reports.view"],
  head_office_coordinator: ["orders.manage", "collections.manage", "reports.view"],
  system_admin: SYSTEM_ADMIN,
  // Super Admin can do everything a System Admin can, and owns the staff lifecycle and the
  // Accounts console.
  // Changing an Employee ID is the Super Admin's alone. It is the key the whole record hangs
  // off -- orders, sessions, booking links and the sign-in itself all name it -- so correcting
  // one is a different kind of act from editing a phone number, which any System Admin may do.
  super_admin: [
    ...SYSTEM_ADMIN,
    "accounts.manage",
    "staff.invite",
    "staff.manage",
    "employee_id.change",
  ],
};

export function hasPermission(roles: readonly RoleValue[], permission: Permission): boolean {
  return roles.some((role) => GRANTS[role].includes(permission));
}

// Seniority for account management: you may only manage accounts ranked below what you can manage.
const RANK: Record<RoleValue, number> = {
  employee: 0,
  factory_operator: 1,
  head_office_coordinator: 1,
  system_admin: 2,
  super_admin: 3,
};

/** Highest rank of account each role may manage. System Admins: employees only. */
const MANAGES_UP_TO: Partial<Record<RoleValue, number>> = {
  system_admin: 0,
  super_admin: 2,
};

const topRank = (roles: readonly RoleValue[]) => Math.max(0, ...roles.map((r) => RANK[r]));

/** Whether an actor holding `actorRoles` may suspend/reset/etc. an account holding `targetRoles`. */
export function canManageAccount(
  actorRoles: readonly RoleValue[],
  targetRoles: readonly RoleValue[],
): boolean {
  const reach = Math.max(-1, ...actorRoles.map((r) => MANAGES_UP_TO[r] ?? -1));
  return topRank(targetRoles) <= reach;
}
