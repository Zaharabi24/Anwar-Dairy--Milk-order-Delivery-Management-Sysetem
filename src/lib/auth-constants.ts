import type { Role } from "./types";

export const ALLOWED_EMAIL_DOMAIN = "anwargroup.net";
export const EMAIL_PLACEHOLDER = "name@anwargroup.net";
export const DOB_HELPER = "Date of birth used for verified reset password";

export type RoleValue =
  "employee" | "factory_operator" | "head_office_coordinator" | "system_admin" | "super_admin";

/** Where a session was started. Employee-portal sessions only ever act as an employee. */
export type Portal = "employee" | "staff";

export const ROLE_VALUES: RoleValue[] = [
  "employee",
  "factory_operator",
  "head_office_coordinator",
  "system_admin",
  "super_admin",
];

/** Roles that sign in through the staff portal. */
export const STAFF_ROLES: RoleValue[] = [
  "factory_operator",
  "head_office_coordinator",
  "system_admin",
  "super_admin",
];

/** Roles a Super Admin can invite (Super Admins themselves are bootstrapped, not invited). */
export type InvitableRole = "factory_operator" | "head_office_coordinator" | "system_admin";

export const INVITABLE_ROLES: { value: InvitableRole; label: string; description: string }[] = [
  {
    value: "factory_operator",
    label: "Factory Operator",
    description: "Creates and publishes the daily milk batch.",
  },
  {
    value: "head_office_coordinator",
    label: "Head Office Coordinator",
    description: "Confirms orders, runs fulfillment and records collections.",
  },
  {
    value: "system_admin",
    label: "System Admin",
    description: "Approves employee accounts and manages the directory and settings.",
  },
];

/** Every role with its display label, for filters and badges. */
export const ALL_ROLES: { value: RoleValue; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "factory_operator", label: "Factory Operator" },
  { value: "head_office_coordinator", label: "Head Office Coordinator" },
  { value: "system_admin", label: "System Admin" },
  { value: "super_admin", label: "Super Admin" },
];

/** @deprecated Sign-in no longer picks a role; kept for existing filters. */
export const SIGNIN_ROLES = ALL_ROLES.filter((r) => r.value !== "super_admin");

export const BUSINESS_UNITS = [
  { code: "AOPL", label: "A1 Polymar" },
  { code: "AIL", label: "Anwar Ispat" },
  { code: "ACSL", label: "Anwar Cement Sheet" },
  { code: "AGL", label: "Anwar Galvanizing Ltd Head Office" },
];

export const OFFICES = [{ code: "AGI_HO", label: "AGI Head Office" }];

export const ROLE_HOME: Record<RoleValue, string> = {
  employee: "/app/offer",
  factory_operator: "/app/operator",
  head_office_coordinator: "/app/fulfillment",
  system_admin: "/app/admin/settings",
  super_admin: "/app/admin/team",
};

/**
 * What the landing page's call to action says once someone is signed in. It points at the same
 * place as ROLE_HOME, so the button names where it is actually going.
 */
export const ROLE_HOME_LABEL: Record<RoleValue, string> = {
  employee: "See today's offer",
  factory_operator: "Operator dashboard",
  head_office_coordinator: "Fulfillment",
  system_admin: "Admin console",
  super_admin: "Admin console",
};

export const ROLE_PRECEDENCE: RoleValue[] = [
  "super_admin",
  "system_admin",
  "head_office_coordinator",
  "factory_operator",
  "employee",
];

/** The label each role code has in the app screens. */
export const ROLE_LABEL: Record<RoleValue, Role> = {
  employee: "Employee",
  factory_operator: "Factory Operator",
  head_office_coordinator: "Head Office Coordinator",
  system_admin: "System Admin",
  super_admin: "Super Admin",
};

export const pickDefaultRole = (roles: string[]): RoleValue =>
  ROLE_PRECEDENCE.find((r) => roles.includes(r)) ?? "employee";

export const roleLabel = (v: string) => ROLE_LABEL[v as RoleValue] ?? v;

export const buLabel = (code: string) => BUSINESS_UNITS.find((b) => b.code === code)?.label ?? code;

export const isRoleValue = (v: unknown): v is RoleValue =>
  typeof v === "string" && (ROLE_VALUES as string[]).includes(v);

export const isStaffRole = (v: string) => (STAFF_ROLES as string[]).includes(v);
