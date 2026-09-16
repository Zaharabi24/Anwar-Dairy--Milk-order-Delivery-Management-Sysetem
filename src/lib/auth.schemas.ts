// Input validation for auth server functions. Safe to import from client code.
// Field rules the user should see inline (domain, DOB, ...) are checked by the
// server function itself so it can answer per field; these only bound the shape.
import { z } from "zod";

const invitableRole = z.enum(["factory_operator", "head_office_coordinator", "system_admin"]);
const shortText = z.string().max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.");
const token = z.string().min(10).max(200);

/** Employee portal: Employee ID + password. */
export const signInInput = z.object({
  // Employee ID or company email.
  employee_id: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

/** Staff portal: company email + password. */
export const staffSignInInput = z.object({
  email: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

export const switchRoleInput = z.object({
  role: z.enum([
    "employee",
    "factory_operator",
    "head_office_coordinator",
    "system_admin",
    "super_admin",
  ]),
});

/** Sign Up is for employees only; staff roles come from invitations. */
export const accountRequestInput = z.object({
  requested_role: z.literal("employee").optional(),
  business_unit_code: z.string().max(20),
  full_name: shortText,
  company_mail: shortText,
  employee_id: z.string().max(40),
  date_of_birth: z.union([isoDate, z.literal("")]),
  office_code: z.string().max(20),
});

export const forgotPasswordInput = z.object({
  employee_id: z.string().max(40),
  company_mail: shortText,
  date_of_birth: z.union([isoDate, z.literal("")]),
});

export const staffForgotPasswordInput = z.object({ email: z.string().trim().max(200) });

export const tokenInput = z.object({ token });

export const setPasswordInput = z.object({ token, password: z.string().max(200) });

export const reviewRequestInput = z.object({
  request_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(1000).optional(),
  department: z
    .enum(["Production", "Finance", "HR", "Sales", "IT", "Admin", "Procurement"])
    .optional(),
  site: z.enum(["Head Office – Gulshan", "Savar Factory"]).optional(),
});

export const accountActionInput = z.object({
  employee_id: z.string().min(1).max(40),
  action: z.enum([
    "suspend",
    "reactivate",
    "deactivate",
    "delete",
    "revoke_sessions",
    "resend_setup",
    "send_reset",
    "change_role",
    "remove_staff_access",
  ]),
  note: z.string().max(1000).optional(),
  role: invitableRole.optional(),
});

/** Profile: only the fields a person owns. */
export const updateProfileInput = z.object({
  full_name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40),
});

export const changePasswordInput = z.object({
  current_password: z.string().min(1).max(200),
  new_password: z.string().min(1).max(200),
});

export const sessionIdInput = z.object({ session_id: z.string().uuid() });

export const accountAuditFilter = z.object({
  event: z.string().max(60).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  search: z.string().max(100).optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});

export const createInvitationInput = z.object({
  email: z.string().trim().max(200),
  role: invitableRole,
  full_name: z.string().trim().max(120).optional(),
  employee_id: z.string().trim().max(40).optional(),
});

export const invitationIdInput = z.object({ invitation_id: z.string().uuid() });

export const acceptInvitationInput = z.object({
  token,
  full_name: z.string().max(120).optional(),
  password: z.string().max(200).optional(),
  current_password: z.string().max(200).optional(),
});

export type SignInInput = z.infer<typeof signInInput>;
export type StaffSignInInput = z.infer<typeof staffSignInInput>;
export type AccountRequestInput = z.infer<typeof accountRequestInput>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInput>;
export type StaffForgotPasswordInput = z.infer<typeof staffForgotPasswordInput>;
export type SetPasswordInput = z.infer<typeof setPasswordInput>;
export type ReviewRequestInput = z.infer<typeof reviewRequestInput>;
export type AccountActionInput = z.infer<typeof accountActionInput>;
export type AccountAuditFilter = z.infer<typeof accountAuditFilter>;
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
export type CreateInvitationInput = z.infer<typeof createInvitationInput>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInput>;
