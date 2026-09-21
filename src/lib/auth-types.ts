import type { InvitableRole, Portal, RoleValue } from "./auth-constants";

export type FieldErrors = Record<string, string>;

/** Shape of every auth call result. Expected failures come back as ok:false, never thrown. */
export interface AuthResult<T = undefined> {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
  data?: T;
}

export interface AuthUser {
  employeeId: string;
  fullName: string;
  companyMail: string;
  /** Roles usable in this session (limited by the portal it was started from). */
  roles: RoleValue[];
  activeRole: RoleValue;
  portal: Portal;
  /**
   * True when this session belongs to somebody with no account: opened by the link mailed on
   * publish, or by matching a company email and employee ID against the Employee Database.
   *
   * The landing page offers these people booking rather than an account, and the app menu leaves
   * out the pages that describe an account they don't have.
   */
  withoutAccount: boolean;
}

export type AccountStatus = "awaiting_password" | "active" | "suspended" | "deactivated";

/** The signed-in person's own account, for the Profile page. */
export interface MyProfile {
  employeeId: string;
  fullName: string;
  companyMail: string;
  phone: string;
  site: string;
  businessUnitName: string | null;
  officeName: string | null;
  roles: RoleValue[];
  status: AccountStatus;
  /** Shown as on file or missing; the date itself never leaves the server. */
  hasDateOfBirth: boolean;
  memberSince: string;
  lastLoginAt: string | null;
}

/** One place this account is signed in, for Privacy & security. */
export interface SessionSummary {
  id: string;
  device: string;
  ip: string | null;
  portal: Portal;
  /** The session making the request. It can be signed out, but only from the account menu. */
  current: boolean;
  startedAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

/** One entry in the account's recent activity. */
export interface AccountActivity {
  id: string;
  event: string;
  at: string;
  ip: string | null;
}
export type RequestStatus = "pending" | "approved" | "rejected" | "expired";

export interface AccountRow {
  employeeId: string;
  fullName: string;
  companyMail: string;
  businessUnitCode: string | null;
  businessUnitName: string | null;
  officeName: string | null;
  roles: RoleValue[];
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  /** Whether the signed-in admin may act on this account. */
  manageable: boolean;
}

/**
 * An account that was deleted. The employees row is kept so past orders still have an owner;
 * `companyMail` is the address that was released and can be used for a new request.
 */
export interface DeletedAccountRow {
  employeeId: string;
  fullName: string;
  companyMail: string;
  businessUnitName: string | null;
  officeName: string | null;
  deletedAt: string;
  deletedBy: string | null;
  retainedOrders: number;
}

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InvitationRow {
  id: string;
  email: string;
  fullName: string | null;
  employeeId: string | null;
  role: InvitableRole | "super_admin";
  status: InvitationStatus;
  invitedBy: string | null;
  createdAt: string;
  lastSentAt: string;
  sendCount: number;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedEmployeeId: string | null;
  revokedAt: string | null;
}

export interface StaffMemberRow {
  employeeId: string;
  fullName: string;
  email: string;
  roles: RoleValue[];
  status: AccountStatus;
  lastLoginAt: string | null;
  joinedAt: string;
  manageable: boolean;
}

export interface TeamData {
  invitations: InvitationRow[];
  members: StaffMemberRow[];
}

/**
 * What happened to an email: delivered to the mail provider ("sent"), caught by a local test
 * inbox such as Mailpit ("captured"), not sent because no transport is configured ("logged"),
 * or rejected/unreachable ("failed").
 */
export type MailDelivery = "sent" | "captured" | "logged" | "failed";

export interface MailTestResult {
  delivery: MailDelivery;
  to: string;
  transport: string;
  error?: string;
}

export interface InvitationSent {
  invitation: InvitationRow;
  delivery: MailDelivery;
  /** Why delivery failed, in plain language. */
  mailError?: string;
}

/** What the accept page shows before anything is submitted. */
export type InvitationPreview =
  | {
      state: "valid";
      email: string;
      role: InvitableRole | "super_admin";
      fullName: string | null;
      invitedBy: string | null;
      expiresAt: string;
      /** Set when the email already has an active account: they confirm their current password. */
      existingAccount: { employeeId: string; fullName: string } | null;
    }
  | { state: "expired" | "revoked" | "accepted" | "invalid"; message: string };

export interface PasswordResetRow {
  id: string;
  employeeId: string;
  fullName: string;
  purpose: "setup" | "reset";
  requestedAt: string;
  status: "sent" | "completed" | "expired";
  completedAt: string | null;
  ip: string | null;
}

export interface AuthAuditRow {
  id: string;
  createdAt: string;
  event: string;
  actor: string | null;
  subject: string | null;
  /** Event details as compact JSON text. */
  detail: string;
  ip: string | null;
}

export interface FailedAttemptGroup {
  identifier: string;
  attempts: number;
  lastAttemptAt: string;
  lastIp: string | null;
}

export interface AccountAuditData {
  events: AuthAuditRow[];
  total: number;
  failedAttempts: FailedAttemptGroup[];
}
