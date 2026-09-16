// Sign in (employee and staff portals), employee account requests, password setup/reset
// and the admin account console. Staff invitations live in invitations.server.ts.
// Expected failures return { ok: false, message | errors } — the UI shows them as-is.
import { getDb, type Sql, type Tx } from "../db/client.server";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto.server";
import {
  button,
  escapeHtml,
  layout,
  mailTransport,
  sendMail,
  sendMailDetailed,
  type MailMessage,
} from "./mail.server";
import {
  activeRoles,
  appUrl,
  clearSessionCookie,
  clientIp,
  getSessionUser,
  requirePermission,
  revokeAllSessions,
  rolesForPortal,
  startSession,
  type SessionUser,
} from "./session.server";
import {
  ALLOWED_EMAIL_DOMAIN,
  BUSINESS_UNITS,
  OFFICES,
  isRoleValue,
  isStaffRole,
  pickDefaultRole,
  roleLabel,
  type Portal,
  type RoleValue,
} from "@/lib/auth-constants";
import type {
  AccountAuditData,
  AccountRequestRow,
  AccountRow,
  DeletedAccountRow,
  AuthAuditRow,
  AuthResult,
  AuthUser,
  FieldErrors,
  MailDelivery,
  MailTestResult,
  PasswordResetRow,
} from "@/lib/auth-types";
import { validateDob, validateEmployeeId } from "@/lib/auth-validation";
import type {
  AccountActionInput,
  AccountAuditFilter,
  AccountRequestInput,
  ForgotPasswordInput,
  ReviewRequestInput,
  SetPasswordInput,
  SignInInput,
  StaffForgotPasswordInput,
  StaffSignInInput,
} from "@/lib/auth.schemas";
import { deliveryNotice } from "@/lib/mail-delivery";
import { canManageAccount } from "@/lib/permissions";

export interface ReviewOutcome {
  decision: "approved" | "rejected";
  delivery?: MailDelivery;
  emailedTo?: string;
  mailError?: string;
}

export interface ActionOutcome {
  delivery?: MailDelivery;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
const GENERIC = "Incorrect Employee ID, company email or password.";
const STAFF_GENERIC = "Incorrect email or password.";
const SETUP_TOKEN_DAYS = 7;
const RESET_TOKEN_MINUTES = 30;
export const iso = (v: Date | string | null) => (v == null ? null : new Date(v).toISOString());
const maskEmail = (e: string) => e.replace(/^(.).*?(@)/, "$1•••••$2");
export const fail = <T>(message: string, errors?: FieldErrors): AuthResult<T> =>
  errors ? { ok: false, message, errors } : { ok: false, message };

export function toAuthUser(user: SessionUser): AuthUser {
  return {
    employeeId: user.employeeId,
    fullName: user.fullName,
    companyMail: user.companyMail,
    roles: user.roles,
    activeRole: user.activeRole,
    portal: user.portal,
  };
}

export function audit(
  db: Tx | Sql,
  entry: { actor?: string | null; subject?: string | null; event: string; detail?: object },
) {
  return db`
    insert into auth_audit (actor_id, subject_id, event, detail, ip)
    values (${entry.actor ?? null}, ${entry.subject ?? null}, ${entry.event},
            ${JSON.stringify(entry.detail ?? {})}::jsonb, ${clientIp()})`;
}

/**
 * Failed sign-in attempts within the lockout window. Pass every identifier of one account
 * (Employee ID and company email) so switching between them can't sidestep the lockout.
 */
export async function failuresFor(db: Tx | Sql, identifier: string | string[]): Promise<number> {
  const keys = (Array.isArray(identifier) ? identifier : [identifier]).map((k) => k.toLowerCase());
  const [row] = await db<Row[]>`
    select count(*)::int as fails from login_attempts
    where lower(identifier) = any(${keys}::text[])
      and outcome not in ('success', 'staff_reset_request', 'invite_token_fail', 'wrong_portal')
      and attempted_at > now() - make_interval(mins => ${LOCK_MINUTES})`;
  return row?.fails ?? 0;
}

export function logAttempt(
  db: Tx | Sql,
  identifier: string,
  outcome: string,
  role: string | null = null,
) {
  return db`insert into login_attempts (identifier, ip, selected_role, outcome)
            values (${identifier}, ${clientIp()}, ${role}, ${outcome})`;
}

async function issueToken(
  tx: Tx,
  employeeId: string,
  purpose: "setup" | "reset",
  portal: Portal,
): Promise<string> {
  const raw = randomToken(32);
  const minutes = purpose === "setup" ? SETUP_TOKEN_DAYS * 24 * 60 : RESET_TOKEN_MINUTES;
  await tx`
    insert into password_tokens (employee_id, purpose, portal, token_hash, expires_at, requested_ip)
    values (${employeeId}, ${purpose}, ${portal}, ${sha256(raw)},
            now() + make_interval(mins => ${minutes}), ${clientIp()})`;
  return raw;
}

// ---------------------------------------------------------------------------
// Session state

export async function getAuthState(): Promise<AuthUser | null> {
  const user = await getSessionUser();
  return user ? toAuthUser(user) : null;
}

/** Employee portal: Employee ID or company email + password, employee role only. */
export async function signIn(input: SignInInput): Promise<AuthResult<{ profile: AuthUser }>> {
  const sql = await getDb();
  const identifier = input.employee_id.trim();
  // Employee IDs never contain "@", so an "@" means the employee typed their company email.
  const byEmail = identifier.includes("@");

  const [emp] = byEmail
    ? await sql<Row[]>`
        select id, name, company_email, account_status, password_hash from employees
        where lower(company_email) = lower(${identifier}) and account_status is not null`
    : await sql<Row[]>`
        select id, name, company_email, account_status, password_hash from employees
        where lower(id) = lower(${identifier}) and account_status is not null`;

  // Attempts are recorded against the Employee ID when the account is known.
  const empId = emp?.id ?? identifier;
  const lockKeys = emp ? [emp.id, emp.company_email] : [identifier];
  if ((await failuresFor(sql, lockKeys)) >= LOCK_AFTER) {
    await logAttempt(sql, empId, "locked", "employee");
    return fail(`Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }

  if (!emp) {
    await verifyPassword(input.password, null); // same cost as a real check
    await logAttempt(sql, empId, "unknown_id", "employee");
    return fail(GENERIC);
  }
  if (emp.account_status === "awaiting_password") {
    await logAttempt(sql, empId, "awaiting_password", "employee");
    return fail("Your password has not been set yet. Use the link in your approval email.");
  }
  if (!(await verifyPassword(input.password, emp.password_hash))) {
    await logAttempt(sql, empId, "bad_password", "employee");
    return fail(GENERIC);
  }
  if (emp.account_status === "suspended") {
    await logAttempt(sql, empId, "suspended", "employee");
    return fail("Your account is on hold. Contact HR.");
  }
  if (emp.account_status !== "active") {
    await logAttempt(sql, empId, "deactivated", "employee");
    return fail(GENERIC);
  }

  const held = await activeRoles(sql, emp.id);
  // This is the one sign-in for everybody who works inside the app: employees, and the operators,
  // coordinators and System Admins who are invited. Only the Super Admin has a separate door, so
  // their credentials are never accepted here. The password has already been checked by this
  // point, so naming the right door gives nothing away.
  if (held.includes("super_admin")) {
    await logAttempt(sql, empId, "wrong_portal", "employee");
    return fail("This is a Super Admin account. Please sign in at /staff/admin.");
  }
  // Holding a staff role means a staff-portal session, so the workspace that role is for is
  // actually reachable; everyone else gets an employee session.
  const portal: Portal = held.some(isStaffRole) ? "staff" : "employee";
  const roles = rolesForPortal(held, portal);
  if (roles.length === 0) {
    await logAttempt(sql, empId, "bad_role", "employee");
    return fail(GENERIC);
  }
  const activeRole = pickDefaultRole(portal === "staff" ? roles.filter(isStaffRole) : roles);

  await sql`update employees set last_login_at = now() where id = ${emp.id}`;
  await audit(sql, {
    subject: emp.id,
    event: "login_success",
    detail: { portal, role: activeRole },
  });
  await logAttempt(sql, empId, "success", "employee");
  await startSession(sql, emp.id, activeRole, portal);

  return {
    ok: true,
    data: {
      profile: {
        employeeId: emp.id,
        fullName: emp.name,
        companyMail: emp.company_email,
        roles,
        activeRole,
        portal,
      },
    },
  };
}

/** Staff portal: company email + password, for accounts holding a staff role. */
export async function staffSignIn(
  input: StaffSignInInput,
): Promise<AuthResult<{ profile: AuthUser }>> {
  const sql = await getDb();
  const email = input.email.trim().toLowerCase();

  if ((await failuresFor(sql, email)) >= LOCK_AFTER) {
    await logAttempt(sql, email, "locked", "staff");
    return fail(`Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }

  const [emp] = await sql<Row[]>`
    select id, name, company_email, account_status, password_hash from employees
    where lower(company_email) = ${email} and account_status is not null`;

  const passwordOk = await verifyPassword(input.password, emp?.password_hash ?? null);
  const roles = emp ? rolesForPortal(await activeRoles(sql, emp.id), "staff") : [];

  // One generic answer for unknown email, wrong password or no staff role.
  if (!emp || !passwordOk || roles.length === 0) {
    await logAttempt(
      sql,
      email,
      !emp ? "unknown_id" : !passwordOk ? "bad_password" : "bad_role",
      "staff",
    );
    return fail(STAFF_GENERIC);
  }
  if (emp.account_status === "suspended") {
    await logAttempt(sql, email, "suspended", "staff");
    return fail("Your account is on hold. Contact your Super Admin.");
  }
  if (emp.account_status !== "active") {
    await logAttempt(sql, email, "deactivated", "staff");
    return fail(STAFF_GENERIC);
  }

  // Everyone else -- operators, coordinators, System Admins -- uses the main sign-in.
  if (!roles.includes("super_admin")) {
    await logAttempt(sql, email, "wrong_portal", "staff");
    return fail("Please sign in from the main Sign In page.");
  }
  const role = pickDefaultRole(roles.filter(isStaffRole));
  await sql`update employees set last_login_at = now() where id = ${emp.id}`;
  await audit(sql, { subject: emp.id, event: "login_success", detail: { portal: "staff", role } });
  await logAttempt(sql, email, "success", "staff");
  await startSession(sql, emp.id, role, "staff");

  return {
    ok: true,
    data: {
      profile: {
        employeeId: emp.id,
        fullName: emp.name,
        companyMail: emp.company_email,
        roles,
        activeRole: role,
        portal: "staff",
      },
    },
  };
}

export async function signOut(): Promise<AuthResult> {
  const user = await getSessionUser();
  if (user) {
    const sql = await getDb();
    await sql`update sessions set revoked_at = now() where id = ${user.sessionId}`;
    await audit(sql, {
      subject: user.employeeId,
      event: "logout",
      detail: { portal: user.portal },
    });
  }
  clearSessionCookie();
  return { ok: true };
}

export async function switchRole(role: RoleValue): Promise<AuthResult<AuthUser>> {
  const user = await getSessionUser();
  if (!user) return fail("Your session has ended. Please sign in again.");
  // Validated against the session's roles loaded from the database, never the client's word.
  if (!user.roles.includes(role)) return fail("You don't hold that role.");
  const sql = await getDb();
  await sql`update sessions set active_role = ${role}, last_seen_at = now() where id = ${user.sessionId}`;
  return { ok: true, data: { ...toAuthUser(user), activeRole: role } };
}

// ---------------------------------------------------------------------------
// Account request (Sign Up) — employees only

export async function submitAccountRequest(
  b: AccountRequestInput,
): Promise<AuthResult<{ reference: string }>> {
  const sql = await getDb();
  const ip = clientIp();
  const email = b.company_mail.trim().toLowerCase();
  const empId = b.employee_id.trim();
  const errors: FieldErrors = {};

  if (!email.endsWith("@" + ALLOWED_EMAIL_DOMAIN))
    errors["company_mail"] = "The mail domain doesn't match.";
  const idError = validateEmployeeId(empId);
  if (idError) errors["employee_id"] = idError;
  if (!b.full_name.trim()) errors["full_name"] = "Full name is required.";
  const dobError = validateDob(b.date_of_birth);
  if (dobError) errors["date_of_birth"] = dobError;
  if (!BUSINESS_UNITS.some((u) => u.code === b.business_unit_code))
    errors["business_unit_code"] = "Select your business unit.";
  if (!OFFICES.some((o) => o.code === b.office_code)) errors["office_code"] = "Select your office.";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const [{ recent }] = (await sql<Row[]>`
    select count(*)::int as recent from account_requests
    where submitted_ip = ${ip} and submitted_at > now() - interval '1 hour'`) as unknown as [
    { recent: number },
  ];
  if (ip && recent >= 3) return fail("Too many requests. Try again later.");

  const [existing] = await sql<Row[]>`
    select id, account_status from employees
    where lower(id) = lower(${empId}) or lower(company_email) = ${email}`;
  if (existing && (await activeRoles(sql, existing.id)).some(isStaffRole)) {
    return fail("You already have an account. Use the Sign In page, or Forgot Password.");
  }
  if (existing?.account_status) {
    return fail("An account already exists for this Employee ID or email. Use Forgot Password.");
  }
  if (existing && existing.id.toLowerCase() !== empId.toLowerCase()) {
    return fail("This company email belongs to a different Employee ID. Contact HR.");
  }

  await sql`update account_requests set status = 'expired' where status = 'pending' and expires_at < now()`;
  const [pending] = await sql<Row[]>`
    select reference from account_requests
    where status = 'pending' and (lower(employee_id) = lower(${empId}) or lower(company_mail) = ${email})`;
  if (pending)
    return fail(`A request for these details is already under review (${pending.reference}).`);

  const [row] = await sql<Row[]>`
    insert into account_requests (reference, requested_role, business_unit_code, office_code, full_name,
                                  company_mail, employee_id, date_of_birth, submitted_ip)
    values ('REQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('account_request_seq')::text, 4, '0'),
            'employee', ${b.business_unit_code}, ${b.office_code}, ${b.full_name.trim()},
            ${email}, ${empId}, ${b.date_of_birth}, ${ip})
    returning reference`;
  await audit(sql, {
    event: "request_submitted",
    detail: { reference: row.reference, employee_id: empId, email },
  });

  // Anyone who can approve employee accounts is told about it.
  const approvers = await sql<Row[]>`
    select distinct e.company_email from employees e
    join user_roles r on r.employee_id = e.id and r.revoked_at is null
                     and r.role in ('system_admin', 'super_admin')
    where e.account_status = 'active'`;
  for (const approver of approvers) {
    await sendMail({
      to: approver.company_email,
      subject: `New account request · ${row.reference}`,
      template: "admin_new_request",
      html: layout(
        "A new account request is waiting",
        `<p><strong>${escapeHtml(b.full_name)}</strong> (${escapeHtml(empId)}) has requested an
         employee account.</p>
         <p>Reference ${escapeHtml(row.reference)}. Review it in Account Requests.</p>
         ${button(`${appUrl()}/app/admin/account-requests`, "Open account requests")}`,
      ),
    });
  }
  return { ok: true, data: { reference: row.reference } };
}

// ---------------------------------------------------------------------------
// Forgot password — employee portal (three fields, field-level answers)

export async function verifyResetIdentity(
  b: ForgotPasswordInput,
): Promise<AuthResult<{ email_masked: string }>> {
  const sql = await getDb();
  const ip = clientIp();
  const email = b.company_mail.trim().toLowerCase();
  const empId = b.employee_id.trim();

  // This endpoint answers per field, so it is rate limited harder than a neutral one.
  const [{ tries }] = (await sql<Row[]>`
    select count(*)::int as tries from login_attempts
    where ip = ${ip} and outcome = 'reset_identity_fail' and attempted_at > now() - interval '1 hour'`) as unknown as [
    { tries: number },
  ];
  if (ip && tries >= 10) return fail("Too many attempts. Try again later.");

  const refuse = async (errors: FieldErrors) => {
    await logAttempt(sql, empId || email, "reset_identity_fail");
    return fail<{ email_masked: string }>("Please check the highlighted fields.", errors);
  };

  const errors: FieldErrors = {};
  if (!empId) errors["employee_id"] = "Employee ID is required.";
  if (!b.date_of_birth) errors["date_of_birth"] = "Date of birth is required.";
  if (!email) errors["company_mail"] = "Company mail is required.";
  else if (!email.endsWith("@" + ALLOWED_EMAIL_DOMAIN))
    errors["company_mail"] = "The mail domain doesn't match.";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const [emp] = await sql<Row[]>`
    select e.id, e.name, e.company_email, e.account_status, to_char(e.date_of_birth, 'YYYY-MM-DD') as dob
    from employees e
    where lower(e.company_email) = ${email} and e.account_status is not null
      and exists (select 1 from user_roles r
                  where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)`;

  if (!emp) return refuse({ company_mail: "This mail found doesn't have any account." });
  if (emp.account_status === "awaiting_password") {
    return refuse({
      company_mail:
        "This account has not been activated yet. Use the setup link sent to your email.",
    });
  }
  if (emp.account_status !== "active")
    return refuse({ company_mail: "This account is not active. Contact HR." });
  if (emp.id.toLowerCase() !== empId.toLowerCase()) {
    return refuse({ employee_id: "This Employee ID doesn't match the account." });
  }
  if (emp.dob !== b.date_of_birth)
    return refuse({ date_of_birth: "This date of birth doesn't match the account." });

  if ((await recentResetTokens(sql, emp.id)) >= 3)
    return fail("Too many reset requests. Try again later.");

  const raw = await sql.begin((tx) => issueToken(tx, emp.id, "reset", "employee"));
  await audit(sql, {
    subject: emp.id,
    event: "password_reset_requested",
    detail: { portal: "employee" },
  });
  await sendMail(
    resetEmail(emp.company_email, emp.name, `${appUrl()}/reset-password?token=${raw}`),
  );

  return { ok: true, data: { email_masked: maskEmail(emp.company_email) } };
}

async function recentResetTokens(sql: Sql, employeeId: string): Promise<number> {
  const [row] = await sql<Row[]>`
    select count(*)::int as recent from password_tokens
    where employee_id = ${employeeId} and purpose = 'reset' and created_at > now() - interval '1 hour'`;
  return row?.recent ?? 0;
}

/**
 * Forgot password — staff portal. Always answers the same way whether or not the email has
 * a staff account, so it can't be used to discover who works here.
 */
export async function staffForgotPassword(
  input: StaffForgotPasswordInput,
): Promise<AuthResult<{ message: string }>> {
  const sql = await getDb();
  const ip = clientIp();
  const email = input.email.trim().toLowerCase();
  const neutral: AuthResult<{ message: string }> = {
    ok: true,
    data: {
      message:
        "If a staff account exists for that email, we've sent a link to reset the password. It expires in 30 minutes.",
    },
  };

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Enter a valid email address.", { email: "Enter a valid email address." });
  }

  const [{ tries }] = (await sql<Row[]>`
    select count(*)::int as tries from login_attempts
    where ip = ${ip} and outcome = 'staff_reset_request' and attempted_at > now() - interval '1 hour'`) as unknown as [
    { tries: number },
  ];
  if (ip && tries >= 10) return fail("Too many attempts. Try again later.");
  await logAttempt(sql, email, "staff_reset_request", "staff");

  const [emp] = await sql<Row[]>`
    select id, name, company_email from employees
    where lower(company_email) = ${email} and account_status = 'active'`;
  if (!emp) return neutral;
  const roles = rolesForPortal(await activeRoles(sql, emp.id), "staff");
  if (roles.length === 0 || (await recentResetTokens(sql, emp.id)) >= 3) return neutral;

  const raw = await sql.begin((tx) => issueToken(tx, emp.id, "reset", "staff"));
  await audit(sql, {
    subject: emp.id,
    event: "password_reset_requested",
    detail: { portal: "staff" },
  });
  await sendMail(
    resetEmail(emp.company_email, emp.name, `${appUrl()}/reset-password?token=${raw}`),
  );
  return neutral;
}

function resetEmail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: "Reset your Anwar Organic password",
    template: "password_reset",
    html: layout(
      "Reset your password",
      `<p>Hello ${escapeHtml(name)},</p>
       <p>Open the link below to choose a new password. It expires in ${RESET_TOKEN_MINUTES} minutes
       and can be used once. You will be signed in straight away once it is saved.</p>
       ${button(link, "Choose a new password")}
       <p style="font-size:13px;color:#64748B;">If you did not request this,
       ignore this email and your password stays unchanged.</p>`,
    ),
  };
}

function setupEmail(to: string, name: string, link: string, intro: string): MailMessage {
  return {
    to,
    subject: "Set your Anwar Organic password",
    template: "setup_link",
    html: layout(
      "Set your password",
      `<p>Hello ${escapeHtml(name)},</p>${intro}
       <p>Set your password using the link below. You will be signed in straight
       away once it is saved.</p>
       ${button(link, "Set my password")}
       <p style="font-size:13px;color:#64748B;">This link expires in ${SETUP_TOKEN_DAYS} days.</p>`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Set / reset password from an emailed link

async function findToken(token: string) {
  const sql = await getDb();
  const [row] = await sql<Row[]>`
    select t.id, t.purpose, t.portal, t.employee_id, e.name, e.company_email, e.account_status
    from password_tokens t
    join employees e on e.id = t.employee_id
    where t.token_hash = ${sha256(token)}
      and t.consumed_at is null
      and t.expires_at > now()
      and e.account_status in ('awaiting_password', 'active')`;
  return row as Row | undefined;
}

// Outlook Safe Links pre-fetches URLs, so opening a link must never consume it.
export async function validatePasswordToken(
  token: string,
): Promise<AuthResult<{ purpose: "setup" | "reset"; full_name: string }>> {
  const tk = await findToken(token);
  if (!tk) return fail("This link is invalid or has expired.");
  return { ok: true, data: { purpose: tk.purpose, full_name: tk.name } };
}

export async function setPassword(
  input: SetPasswordInput,
): Promise<AuthResult<{ profile: AuthUser; purpose: "setup" | "reset" }>> {
  if (input.password.length < 8) return fail("Min 8 characters", { password: "Min 8 characters" });
  const tk = await findToken(input.token);
  if (!tk) return fail("This link is invalid or has expired.");

  const passwordHash = await hashPassword(input.password);
  const sql = await getDb();
  const profile = await sql.begin(async (tx): Promise<AuthUser | null> => {
    // Consume atomically: a second submit with the same link finds nothing.
    const [consumed] = await tx<Row[]>`
      update password_tokens set consumed_at = now()
      where id = ${tk.id} and consumed_at is null and expires_at > now()
      returning id`;
    if (!consumed) return null;
    await tx`update password_tokens set consumed_at = now()
             where employee_id = ${tk.employee_id} and consumed_at is null`;
    await tx`
      update employees set
        password_hash = ${passwordHash},
        account_status = 'active',
        activated_at = coalesce(activated_at, now()),
        last_login_at = now(),
        updated_at = now()
      where id = ${tk.employee_id}`;
    // Push out anyone already signed in on this account before minting the new session.
    await revokeAllSessions(tx, tk.employee_id);
    await audit(tx, {
      subject: tk.employee_id,
      event: tk.purpose === "setup" ? "password_set" : "password_reset_completed",
    });

    const held = await activeRoles(tx, tk.employee_id);
    let portal: Portal = tk.portal;
    let roles = rolesForPortal(held, portal);
    if (roles.length === 0) {
      portal = portal === "staff" ? "employee" : "staff";
      roles = rolesForPortal(held, portal);
    }
    if (roles.length === 0) return null;
    const role = pickDefaultRole(portal === "staff" ? roles.filter(isStaffRole) : roles);
    await startSession(tx, tk.employee_id, role, portal);
    await audit(tx, {
      subject: tk.employee_id,
      event: "login_success",
      detail: { via: "password_set", portal, role },
    });
    return {
      employeeId: tk.employee_id,
      fullName: tk.name,
      companyMail: tk.company_email,
      roles,
      activeRole: role,
      portal,
    };
  });
  if (!profile) return fail("This link is invalid or has expired.");

  if (tk.purpose === "reset") {
    await sendMail({
      to: tk.company_email,
      subject: "Your Anwar Organic password was changed",
      template: "reset_confirm",
      html: layout(
        "Your password was changed",
        `<p>Hello ${escapeHtml(tk.name)},</p>
         <p>Your password was changed on
         ${escapeHtml(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }))}.</p>
         <p>All other sessions have been signed out.
         <strong>If this was not you, contact IT immediately.</strong></p>`,
      ),
    });
  }
  return { ok: true, data: { profile, purpose: tk.purpose } };
}

// ---------------------------------------------------------------------------
// Admin: employee account requests

export async function listAccountRequests(): Promise<AuthResult<AccountRequestRow[]>> {
  await requirePermission("employee_accounts.manage");
  const sql = await getDb();
  await sql`update account_requests set status = 'expired' where status = 'pending' and expires_at < now()`;
  const rows = await sql<Row[]>`
    select r.*, bu.name as business_unit_name, o.name as office_name,
           exists (select 1 from employees e
                   where (lower(e.id) = lower(r.employee_id) or lower(e.company_email) = lower(r.company_mail))
                     and e.account_status is not null) as existing_account,
           -- Matched on the Employee ID alone: a deleted account's email has been moved aside.
           exists (select 1 from employees e
                   where lower(e.id) = lower(r.employee_id) and e.deleted_at is not null)
             as account_deleted
    from account_requests r
    join business_units bu on bu.code = r.business_unit_code
    join offices o on o.code = r.office_code
    order by r.submitted_at desc
    limit 1000`;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      reference: r.reference,
      submittedAt: iso(r.submitted_at)!,
      fullName: r.full_name,
      employeeId: r.employee_id,
      companyMail: r.company_mail,
      businessUnitCode: r.business_unit_code,
      businessUnitName: r.business_unit_name,
      officeName: r.office_name,
      requestedRole: r.requested_role,
      grantedRole: r.granted_role,
      status: r.status,
      reviewedBy: r.reviewed_by,
      reviewedAt: iso(r.reviewed_at),
      decisionNote: r.decision_note,
      submittedIp: r.submitted_ip,
      hasDateOfBirth: r.date_of_birth != null,
      existingAccount: r.existing_account,
      accountDeleted: r.account_deleted,
    })),
  };
}

export async function reviewAccountRequest(
  input: ReviewRequestInput,
): Promise<AuthResult<ReviewOutcome>> {
  const actor = await requirePermission("employee_accounts.manage");
  const sql = await getDb();

  type Outcome = AuthResult<ReviewOutcome> & { mail?: MailMessage };
  const outcome = await sql.begin(async (tx): Promise<Outcome> => {
    const [rq] = await tx<Row[]>`
      select r.*, to_char(r.date_of_birth, 'YYYY-MM-DD') as dob, bu.name as business_unit_name
      from account_requests r join business_units bu on bu.code = r.business_unit_code
      where r.id = ${input.request_id} for update of r`;
    if (!rq) return fail("Request not found.");
    if (rq.status !== "pending") return fail("This request has already been decided.");
    if (
      rq.company_mail.toLowerCase() === actor.companyMail.toLowerCase() ||
      rq.employee_id.toLowerCase() === actor.employeeId.toLowerCase()
    ) {
      return fail("You cannot decide on your own request.");
    }

    if (input.decision === "reject") {
      const note = input.note?.trim() ?? "";
      if (note.length < 3)
        return fail("A reason is required to reject.", { note: "A reason is required to reject." });
      await tx`
        update account_requests set status = 'rejected', reviewed_by = ${actor.employeeId},
          reviewed_at = now(), decision_note = ${note}
        where id = ${rq.id}`;
      await audit(tx, {
        actor: actor.employeeId,
        event: "request_rejected",
        detail: { reference: rq.reference, note },
      });
      return {
        ok: true,
        data: { decision: "rejected" },
        mail: {
          to: rq.company_mail,
          subject: "Your Anwar Organic account request",
          template: "request_rejected",
          html: layout(
            "Your account request was not approved",
            `<p>Hello ${escapeHtml(rq.full_name)},</p>
             <p>Request <strong>${escapeHtml(rq.reference)}</strong> was not approved.</p>
             <p style="background:#F8FAFC;border-left:3px solid #CBD5E1;padding:12px 16px;">${escapeHtml(note)}</p>
             <p>If you believe this is an error, contact HR.</p>`,
          ),
        },
      };
    }

    // Account requests only ever grant the employee role; staff roles come from invitations.
    const grantedRole: RoleValue = "employee";
    const [taken] = await tx<Row[]>`
      select id, account_status from employees
      where lower(id) = lower(${rq.employee_id}) or lower(company_email) = lower(${rq.company_mail})`;
    if (taken?.account_status)
      return fail("An account already exists for this Employee ID or email.");
    if (taken && taken.id.toLowerCase() !== rq.employee_id.toLowerCase()) {
      return fail(`${rq.company_mail} is already used by employee ${taken.id}.`);
    }

    // Reuse the roster entry when HR already has this employee; otherwise create one.
    if (taken) {
      await tx`
        update employees set name = ${rq.full_name}, company_email = ${rq.company_mail},
          date_of_birth = ${rq.dob}, business_unit_code = ${rq.business_unit_code},
          office_code = ${rq.office_code}, account_status = 'awaiting_password', active = true,
          -- Reusing the row of a deleted account: it is a live account again, and its past
          -- orders come back with it.
          deleted_at = null, deleted_by = null, former_company_email = null, deactivated_at = null,
          updated_at = now()
        where id = ${taken.id}`;
    } else {
      await tx`
        insert into employees (id, name, company_email, phone, department, site, active, date_of_birth,
                               business_unit_code, office_code, account_status)
        values (${rq.employee_id}, ${rq.full_name}, ${rq.company_mail}, '',
                ${input.department ?? "Admin"}, ${input.site ?? "Head Office – Gulshan"}, true, ${rq.dob},
                ${rq.business_unit_code}, ${rq.office_code}, 'awaiting_password')`;
    }
    const employeeId = taken?.id ?? rq.employee_id;

    await tx`insert into user_roles (employee_id, role, granted_by) values (${employeeId}, 'employee', ${actor.employeeId})
             on conflict do nothing`;
    await tx`
      update account_requests set status = 'approved', granted_role = ${grantedRole},
        reviewed_by = ${actor.employeeId}, reviewed_at = now(), decision_note = ${input.note?.trim() || null}
      where id = ${rq.id}`;

    const raw = await issueToken(tx, employeeId, "setup", "employee");
    await audit(tx, {
      actor: actor.employeeId,
      subject: employeeId,
      event: "request_approved",
      detail: { reference: rq.reference, requested: rq.requested_role, granted: grantedRole },
    });

    return {
      ok: true,
      data: { decision: "approved" },
      mail: setupEmail(
        rq.company_mail,
        rq.full_name,
        `${appUrl()}/set-password?token=${raw}`,
        `<p>Your account request <strong>${escapeHtml(rq.reference)}</strong> has been approved.</p>
         <table style="font-size:15px;color:#334155;margin:16px 0;">
           <tr><td style="padding:4px 24px 4px 0;color:#64748B;">Employee ID</td>
               <td style="font-weight:600;">${escapeHtml(employeeId)}</td></tr>
           <tr><td style="padding:4px 24px 4px 0;color:#64748B;">Role</td>
               <td style="font-weight:600;">${escapeHtml(roleLabel(grantedRole))}</td></tr>
           <tr><td style="padding:4px 24px 4px 0;color:#64748B;">Business Unit</td>
               <td style="font-weight:600;">${escapeHtml(rq.business_unit_name)}</td></tr>
         </table>`,
      ),
    };
  });

  const { mail, ...result } = outcome;
  if (!mail || !result.ok || !result.data) return result;
  // After commit, so a rollback never sends a live link.
  const sent = await sendMailDetailed(mail);
  return {
    ...result,
    data: {
      ...result.data,
      delivery: sent.delivery,
      emailedTo: mail.to,
      ...(sent.error ? { mailError: sent.error } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Admin: accounts

export async function listAccounts(): Promise<AuthResult<AccountRow[]>> {
  const actor = await requirePermission("employee_accounts.manage");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select e.id, e.name, e.company_email, e.business_unit_code, bu.name as business_unit_name,
           o.name as office_name, e.account_status, e.last_login_at, e.created_at,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}') as roles
    from employees e
    left join business_units bu on bu.code = e.business_unit_code
    left join offices o on o.code = e.office_code
    left join user_roles r on r.employee_id = e.id and r.revoked_at is null
    where e.account_status is not null
    group by e.id, bu.name, o.name
    order by e.created_at desc`;
  return {
    ok: true,
    data: rows.map((r) => {
      const roles = (r.roles as string[]).filter(isRoleValue);
      return {
        employeeId: r.id,
        fullName: r.name,
        companyMail: r.company_email,
        businessUnitCode: r.business_unit_code,
        businessUnitName: r.business_unit_name,
        officeName: r.office_name,
        roles,
        status: r.account_status,
        lastLoginAt: iso(r.last_login_at),
        createdAt: iso(r.created_at)!,
        manageable: r.id !== actor.employeeId && canManageAccount(actor.roles, roles),
      };
    }),
  };
}

/**
 * Accounts that were deleted. The employees row is kept so past orders still have an owner, so
 * this is also the record of which orders belong to someone who no longer has access.
 */
export async function listDeletedAccounts(): Promise<AuthResult<DeletedAccountRow[]>> {
  await requirePermission("employee_accounts.manage");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select e.id, e.name, coalesce(e.former_company_email, e.company_email) as company_email,
           bu.name as business_unit_name, o.name as office_name, e.deleted_at, e.deleted_by,
           (select count(*)::int from orders where employee_id = e.id) as retained_orders
    from employees e
    left join business_units bu on bu.code = e.business_unit_code
    left join offices o on o.code = e.office_code
    where e.deleted_at is not null
    order by e.deleted_at desc
    limit 500`;
  return {
    ok: true,
    data: rows.map((r) => ({
      employeeId: r.id,
      fullName: r.name,
      companyMail: r.company_email,
      businessUnitName: r.business_unit_name,
      officeName: r.office_name,
      deletedAt: iso(r.deleted_at)!,
      deletedBy: r.deleted_by,
      retainedOrders: r.retained_orders,
    })),
  };
}

/** Everything an admin can do to an account after it exists. */
export async function accountAction(input: AccountActionInput): Promise<AuthResult<ActionOutcome>> {
  const staffAction = input.action === "change_role" || input.action === "remove_staff_access";
  const actor = await requirePermission(staffAction ? "staff.manage" : "employee_accounts.manage");
  if (input.employee_id.toLowerCase() === actor.employeeId.toLowerCase()) {
    return fail("You cannot perform this on your own account.");
  }
  const sql = await getDb();

  const outcome = await sql.begin(
    async (tx): Promise<AuthResult<ActionOutcome> & { mail?: MailMessage }> => {
      const [emp] = await tx<Row[]>`
      select id, name, company_email, account_status from employees
      where lower(id) = lower(${input.employee_id}) and account_status is not null
      for update`;
      if (!emp) return fail("Account not found.");
      const roles = await activeRoles(tx, emp.id);
      if (!canManageAccount(actor.roles, roles)) {
        return fail(
          roles.includes("super_admin")
            ? "Super Admin accounts can't be changed from the app."
            : "This account is managed by a Super Admin.",
        );
      }
      const log = (event: string, detail: object = {}) =>
        audit(tx, { actor: actor.employeeId, subject: emp.id, event, detail });
      const hasStaffRole = roles.some(isStaffRole);

      switch (input.action) {
        case "suspend":
          if (emp.account_status !== "active")
            return fail("Only active accounts can be suspended.");
          await tx`update employees set account_status = 'suspended', updated_at = now() where id = ${emp.id}`;
          await revokeAllSessions(tx, emp.id);
          await log("account_suspended", { note: input.note ?? null });
          return { ok: true, message: `${emp.name} suspended.` };

        case "reactivate": {
          if (emp.account_status !== "suspended" && emp.account_status !== "deactivated") {
            return fail("Only suspended or deactivated accounts can be reactivated.");
          }
          const [{ has_password }] = (await tx<Row[]>`
          select password_hash is not null as has_password from employees where id = ${emp.id}`) as unknown as [
            { has_password: boolean },
          ];
          const status = has_password ? "active" : "awaiting_password";
          await tx`update employees set account_status = ${status}, active = ${roles.includes("employee")},
                 deactivated_at = null, updated_at = now() where id = ${emp.id}`;
          await log("account_reactivated");
          return { ok: true, message: `${emp.name} reactivated.` };
        }

        case "deactivate": {
          await tx`update employees set account_status = 'deactivated', active = false,
                 deactivated_at = now(), updated_at = now() where id = ${emp.id}`;
          await revokeAllSessions(tx, emp.id);
          await tx`update invitations set status = 'revoked', revoked_at = now(), revoked_by = ${actor.employeeId}
                 where email = lower(${emp.company_email}) and status = 'pending'`;
          const cancelled = await tx<Row[]>`
          update orders set status = 'Cancelled', updated_at = now()
          where employee_id = ${emp.id} and status in ('Pending', 'Confirmed', 'CancellationRequested')
          returning order_no`;
          await log("account_deactivated", {
            note: input.note ?? null,
            cancelled_orders: cancelled.map((o) => o.order_no),
          });
          return {
            ok: true,
            message: `${emp.name} deactivated${cancelled.length ? ` and ${cancelled.length} pending order(s) cancelled` : ""}.`,
          };
        }

        case "delete": {
          // The employees row survives as a non-login historical record: orders point at it with
          // "on delete restrict", and reconciliation, collections and billing all read them.
          // Only the account is removed, and the email is released for a fresh request.
          const cancelled = await tx<Row[]>`
          update orders set status = 'Cancelled', updated_at = now()
          where employee_id = ${emp.id} and status in ('Pending', 'Confirmed', 'CancellationRequested')
          returning order_no`;
          const [{ kept }] = (await tx<Row[]>`
          select count(*)::int as kept from orders where employee_id = ${emp.id}`) as unknown as [
            { kept: number },
          ];
          await tx`update user_roles set revoked_at = now(), revoked_by = ${actor.employeeId}
                 where employee_id = ${emp.id} and revoked_at is null`;
          // Any setup or reset link already in an inbox stops working.
          await tx`delete from password_tokens where employee_id = ${emp.id}`;
          await tx`update invitations set status = 'revoked', revoked_at = now(), revoked_by = ${actor.employeeId}
                 where email = lower(${emp.company_email}) and status = 'pending'`;
          await revokeAllSessions(tx, emp.id);
          // account_status back to null is what "not an account" means everywhere else: the row
          // leaves the accounts list and can't sign in. The address moves to former_company_email
          // so the unique index on company_email no longer blocks re-registration.
          await tx`
          update employees set account_status = null, password_hash = null, active = false,
            deleted_at = now(), deleted_by = ${actor.employeeId},
            former_company_email = company_email,
            company_email = 'deleted+' || extract(epoch from now())::bigint || '+' || id || '@anwargroup.net',
            deactivated_at = now(), updated_at = now()
          where id = ${emp.id}`;
          await log("account_deleted", {
            employee_id: emp.id,
            name: emp.name,
            email: emp.company_email,
            roles,
            retained_orders: kept,
            cancelled_orders: cancelled.map((o) => o.order_no),
          });
          return {
            ok: true,
            message:
              `${emp.name}'s account was deleted and ${emp.company_email} is free to request a new one` +
              `${kept ? `. ${kept} past order(s) were kept` : ""}` +
              `${cancelled.length ? `, and ${cancelled.length} open order(s) were cancelled` : ""}.`,
          };
        }

        case "revoke_sessions":
          await revokeAllSessions(tx, emp.id);
          await log("sessions_revoked");
          return { ok: true, message: `All sessions for ${emp.name} were signed out.` };

        case "change_role": {
          // Switches a staff member between staff roles. Granting a first staff role needs an invitation.
          if (!input.role) return fail("Choose a role.");
          if (!hasStaffRole) {
            return fail("This person isn't on the staff team. Send them an invitation instead.");
          }
          if (roles.includes(input.role))
            return fail(`${emp.name} is already ${roleLabel(input.role)}.`);
          await tx`
          update user_roles set revoked_at = now(), revoked_by = ${actor.employeeId}
          where employee_id = ${emp.id} and role not in ('employee', 'super_admin') and revoked_at is null`;
          await tx`insert into user_roles (employee_id, role, granted_by)
                 values (${emp.id}, ${input.role}, ${actor.employeeId})
                 on conflict do nothing`;
          await log("staff_role_changed", {
            from: roles.filter((r) => r !== "employee"),
            to: input.role,
          });
          return { ok: true, message: `${emp.name} is now ${roleLabel(input.role)}.` };
        }

        case "remove_staff_access": {
          if (!hasStaffRole) return fail("This person has no staff access to remove.");
          await tx`
          update user_roles set revoked_at = now(), revoked_by = ${actor.employeeId}
          where employee_id = ${emp.id} and role <> 'employee' and revoked_at is null`;
          await revokeAllSessions(tx, emp.id, "staff");
          const keepsEmployee = roles.includes("employee");
          if (!keepsEmployee) {
            await tx`update employees set account_status = 'deactivated', deactivated_at = now(), updated_at = now()
                   where id = ${emp.id}`;
            await revokeAllSessions(tx, emp.id);
          }
          await log("staff_access_removed", {
            removed: roles.filter(isStaffRole),
            keeps_employee: keepsEmployee,
          });
          return {
            ok: true,
            message: keepsEmployee
              ? `${emp.name} no longer has staff access (their employee account stays).`
              : `${emp.name}'s staff access was removed and the account deactivated.`,
          };
        }

        case "resend_setup": {
          if (emp.account_status !== "awaiting_password")
            return fail("This account has already set a password.");
          const raw = await issueToken(tx, emp.id, "setup", hasStaffRole ? "staff" : "employee");
          await log("setup_link_resent");
          return {
            ok: true,
            message: `Setup link for ${emp.company_email}.`,
            mail: setupEmail(
              emp.company_email,
              emp.name,
              `${appUrl()}/set-password?token=${raw}`,
              "",
            ),
          };
        }

        case "send_reset": {
          if (emp.account_status !== "active")
            return fail("Reset links can only be sent to active accounts.");
          const raw = await issueToken(tx, emp.id, "reset", hasStaffRole ? "staff" : "employee");
          await log("reset_link_sent");
          return {
            ok: true,
            message: `Reset link for ${emp.company_email}.`,
            mail: resetEmail(
              emp.company_email,
              emp.name,
              `${appUrl()}/reset-password?token=${raw}`,
            ),
          };
        }
      }
    },
  );

  const { mail, ...result } = outcome;
  if (!mail || !result.ok) return result;
  const sent = await sendMailDetailed(mail);
  const what = mail.template === "password_reset" ? "Password reset link" : "Password setup link";
  return {
    ...result,
    message: deliveryNotice(sent.delivery, what, mail.to, sent.error).text,
    data: { delivery: sent.delivery },
  };
}

// ---------------------------------------------------------------------------
// Admin: password resets and audit

export async function listPasswordResets(): Promise<AuthResult<PasswordResetRow[]>> {
  await requirePermission("account_audit.view");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select t.id, t.employee_id, e.name, t.purpose, t.created_at, t.consumed_at, t.expires_at, t.requested_ip,
           case when t.consumed_at is not null then 'completed'
                when t.expires_at < now() then 'expired'
                else 'sent' end as status
    from password_tokens t
    join employees e on e.id = t.employee_id
    where t.created_at > now() - interval '30 days'
    order by t.created_at desc`;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      fullName: r.name,
      purpose: r.purpose,
      requestedAt: iso(r.created_at)!,
      status: r.status,
      completedAt: iso(r.consumed_at),
      ip: r.requested_ip,
    })),
  };
}

export async function listAuthAudit(f: AccountAuditFilter): Promise<AuthResult<AccountAuditData>> {
  await requirePermission("account_audit.view");
  const sql = await getDb();
  const pageSize = 50;
  const search = f.search?.trim() ? `%${f.search.trim().toLowerCase()}%` : null;
  const where = sql`
    where (${f.event ?? null}::text is null or a.event = ${f.event ?? null})
      and (${f.from ?? null}::date is null or a.created_at >= ${f.from ?? null}::date)
      and (${f.to ?? null}::date is null or a.created_at < ${f.to ?? null}::date + 1)
      and (${search}::text is null
           or lower(coalesce(a.actor_id, '')) like ${search} or lower(coalesce(a.subject_id, '')) like ${search}
           or lower(coalesce(actor.name, '')) like ${search} or lower(coalesce(subject.name, '')) like ${search})`;

  const [rows, [{ total }], failed] = await Promise.all([
    sql<Row[]>`
      select a.*, actor.name as actor_name, subject.name as subject_name
      from auth_audit a
      left join employees actor on actor.id = a.actor_id
      left join employees subject on subject.id = a.subject_id
      ${where}
      order by a.created_at desc, a.id desc
      limit ${pageSize} offset ${(f.page - 1) * pageSize}`,
    sql<Row[]>`
      select count(*)::int as total from auth_audit a
      left join employees actor on actor.id = a.actor_id
      left join employees subject on subject.id = a.subject_id
      ${where}`,
    sql<Row[]>`
      select min(identifier) as identifier, count(*)::int as attempts, max(attempted_at) as last_attempt_at,
             (array_agg(ip order by attempted_at desc))[1] as last_ip
      from login_attempts
      where attempted_at > now() - interval '24 hours'
        and outcome not in ('success', 'staff_reset_request')
      group by lower(identifier)
      order by attempts desc, last_attempt_at desc`,
  ]);

  const person = (id: string | null, name: string | null) =>
    id ? (name ? `${name} (${id})` : id) : null;
  return {
    ok: true,
    data: {
      total,
      events: rows.map((r): AuthAuditRow => ({
        id: String(r.id),
        createdAt: iso(r.created_at)!,
        event: r.event,
        actor: person(r.actor_id, r.actor_name),
        subject: person(r.subject_id, r.subject_name),
        detail: JSON.stringify(r.detail ?? {}),
        ip: r.ip,
      })),
      failedAttempts: failed.map((r) => ({
        identifier: r.identifier,
        attempts: r.attempts,
        lastAttemptAt: iso(r.last_attempt_at)!,
        lastIp: r.last_ip,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Admin: email delivery check

/** Sends a test message to the signed-in admin so they can confirm real delivery works. */
export async function sendTestEmail(): Promise<AuthResult<MailTestResult>> {
  const actor = await requirePermission("employee_accounts.manage");
  const { description } = mailTransport();
  const sent = await sendMailDetailed({
    to: actor.companyMail,
    subject: "Anwar Organic test email",
    template: "test_email",
    html: layout(
      "Email delivery works",
      `<p>Hello ${escapeHtml(actor.fullName)},</p>
       <p>This test was sent from Anwar Organic using ${escapeHtml(description)}.</p>
       <p>If you received it, invitations and account emails will reach people too.</p>`,
    ),
  });
  await audit(await getDb(), {
    actor: actor.employeeId,
    event: "test_email_sent",
    detail: { delivery: sent.delivery, transport: description },
  });
  return {
    ok: true,
    data: {
      delivery: sent.delivery,
      to: actor.companyMail,
      transport: description,
      ...(sent.error ? { error: sent.error } : {}),
    },
  };
}
