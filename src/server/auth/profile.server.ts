// Self-service account management: the Profile and Privacy & security pages.
//
// Everything here acts on the caller's own account. Who that is comes from the session, never from
// the request, so there is nothing to authorise beyond being signed in -- and nothing here can
// reach another person's account even if an id were supplied.
import { getDb } from "../db/client.server";
import { audit } from "./auth.server";
import { hashPassword, verifyPassword } from "./crypto.server";
import { escapeHtml, layout, sendMail } from "./mail.server";
import { clientIp, requireUser } from "./session.server";
import type { ChangePasswordInput, UpdateProfileInput } from "@/lib/auth.schemas";
import type { AccountActivity, AuthResult, MyProfile, SessionSummary } from "@/lib/auth-types";

type Row = Record<string, string>;

const fail = <T = undefined>(message: string, errors?: Record<string, string>): AuthResult<T> => ({
  ok: false,
  message,
  ...(errors ? { errors } : {}),
});

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

/**
 * A short, honest label for a sign-in. The full user agent is never shown: it is long, it means
 * nothing to most people, and it is the browser's claim rather than a fact about the device.
 */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua)
        ? "iOS"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

// ---------------------------------------------------------------------------
// Profile

export async function getMyProfile(): Promise<AuthResult<MyProfile>> {
  const user = await requireUser();
  const sql = await getDb();
  const [row] = await sql<Row[]>`
    select e.id, e.name, e.company_email, e.phone, e.department, e.site, e.account_status,
           bu.name as business_unit_name, o.name as office_name,
           e.date_of_birth is not null as has_dob,
           coalesce(e.activated_at, e.created_at) as member_since, e.last_login_at
    from employees e
    left join business_units bu on bu.code = e.business_unit_code
    left join offices o on o.code = e.office_code
    where e.id = ${user.employeeId}`;
  if (!row) return fail("We couldn't load your profile.");
  return {
    ok: true,
    data: {
      employeeId: row["id"]!,
      fullName: row["name"]!,
      companyMail: row["company_email"]!,
      phone: row["phone"] ?? "",
      department: row["department"]!,
      site: row["site"]!,
      businessUnitName: row["business_unit_name"] ?? null,
      officeName: row["office_name"] ?? null,
      roles: user.roles,
      status: row["account_status"] as MyProfile["status"],
      hasDateOfBirth: Boolean(row["has_dob"]),
      memberSince: iso(row["member_since"])!,
      lastLoginAt: iso(row["last_login_at"]),
    },
  };
}

/**
 * The two fields a person owns. Everything else on the profile -- Employee ID, company email,
 * department, site, business unit, roles -- is HR or admin data, shown read-only so the directory
 * and sign-in stay under the control of the people responsible for them.
 */
export async function updateMyProfile(input: UpdateProfileInput): Promise<AuthResult<MyProfile>> {
  const user = await requireUser();
  const fullName = input.full_name.trim();
  const phone = input.phone.trim();
  const errors: Record<string, string> = {};
  if (fullName.length < 2) errors["full_name"] = "Enter your full name.";
  if (phone && !/^[0-9+][0-9\s()-]{4,29}$/.test(phone))
    errors["phone"] = "Enter a valid phone number.";
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);

  const sql = await getDb();
  const [before] = await sql<
    Row[]
  >`select name, phone from employees where id = ${user.employeeId}`;
  await sql`
    update employees set name = ${fullName}, phone = ${phone}, updated_at = now()
    where id = ${user.employeeId}`;
  const changed = [
    ...(before?.["name"] !== fullName ? ["name"] : []),
    ...((before?.["phone"] ?? "") !== phone ? ["phone"] : []),
  ];
  if (changed.length) {
    await audit(sql, {
      actor: user.employeeId,
      subject: user.employeeId,
      event: "profile_updated",
      detail: { changed },
    });
  }
  const reloaded = await getMyProfile();
  return { ...reloaded, message: changed.length ? "Your profile was saved." : "Nothing to save." };
}

// ---------------------------------------------------------------------------
// Privacy & security

export async function changeMyPassword(
  input: ChangePasswordInput,
): Promise<AuthResult<{ signedOut: number }>> {
  const user = await requireUser();
  const next = input.new_password;
  if (next.length < 8)
    return fail("Please fix the highlighted fields.", { new_password: "Min 8 characters" });
  if (next === input.current_password)
    return fail("Please fix the highlighted fields.", {
      new_password: "Choose a password you haven't used here before.",
    });

  const sql = await getDb();
  const [emp] = await sql<Row[]>`
    select name, company_email, password_hash from employees where id = ${user.employeeId}`;
  if (!emp) return fail("We couldn't load your account.");
  if (!(await verifyPassword(input.current_password, emp["password_hash"] ?? null))) {
    await sql`insert into login_attempts (identifier, ip, outcome)
              values (${user.employeeId}, ${clientIp()}, 'password_change_fail')`;
    return fail("Please fix the highlighted fields.", {
      current_password: "That isn't your current password.",
    });
  }

  const hash = await hashPassword(next);
  // Other sessions end, this one stays: changing a password is how someone shuts out a device they
  // no longer trust, and signing them out of the page they are on would hide that it worked.
  const signedOut = await sql<Row[]>`
    update sessions set revoked_at = now()
    where employee_id = ${user.employeeId} and revoked_at is null and id <> ${user.sessionId}
    returning id`;
  await sql`
    update employees set password_hash = ${hash}, updated_at = now() where id = ${user.employeeId}`;
  // Any outstanding reset link is now a second way in, so it goes too.
  await sql`update password_tokens set consumed_at = now()
            where employee_id = ${user.employeeId} and consumed_at is null`;
  await audit(sql, {
    actor: user.employeeId,
    subject: user.employeeId,
    event: "password_changed",
    detail: { signed_out_sessions: signedOut.length },
  });

  await sendMail({
    to: emp["company_email"]!,
    subject: "Your Anwar Organic password was changed",
    template: "password_changed",
    html: layout(
      "Your password was changed",
      `<p>Hello ${escapeHtml(emp["name"]!)},</p>
       <p>Your password was changed on
       ${escapeHtml(new Date().toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }))}.</p>
       <p>Any other device that was signed in has been signed out.
       <strong>If this was not you, contact IT immediately.</strong></p>`,
    ),
  });

  return {
    ok: true,
    data: { signedOut: signedOut.length },
    message: signedOut.length
      ? `Password changed. ${signedOut.length} other session(s) were signed out.`
      : "Password changed.",
  };
}

/** Where this account is currently signed in. */
export async function listMySessions(): Promise<AuthResult<SessionSummary[]>> {
  const user = await requireUser();
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id, ip, user_agent, portal, created_at, last_seen_at, expires_at
    from sessions
    where employee_id = ${user.employeeId} and revoked_at is null and expires_at > now()
    order by last_seen_at desc
    limit 50`;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r["id"]!,
      device: deviceLabel(r["user_agent"] ?? null),
      ip: r["ip"] ?? null,
      portal: r["portal"] as SessionSummary["portal"],
      current: r["id"] === user.sessionId,
      startedAt: iso(r["created_at"])!,
      lastSeenAt: iso(r["last_seen_at"])!,
      expiresAt: iso(r["expires_at"])!,
    })),
  };
}

/** Ends one other session. Scoped to this account, so an id from elsewhere matches nothing. */
export async function revokeMySession(sessionId: string): Promise<AuthResult<{ ended: number }>> {
  const user = await requireUser();
  if (sessionId === user.sessionId) {
    return fail("That's the session you're using. Sign out from the menu instead.");
  }
  const sql = await getDb();
  const ended = await sql<Row[]>`
    update sessions set revoked_at = now()
    where id = ${sessionId} and employee_id = ${user.employeeId} and revoked_at is null
    returning id`;
  if (!ended.length) return fail("That session has already ended.");
  await audit(sql, {
    actor: user.employeeId,
    subject: user.employeeId,
    event: "session_signed_out",
    detail: { session_id: sessionId },
  });
  return { ok: true, data: { ended: ended.length }, message: "That device was signed out." };
}

/** Ends every other session at once. */
export async function revokeMyOtherSessions(): Promise<AuthResult<{ ended: number }>> {
  const user = await requireUser();
  const sql = await getDb();
  const ended = await sql<Row[]>`
    update sessions set revoked_at = now()
    where employee_id = ${user.employeeId} and revoked_at is null and id <> ${user.sessionId}
    returning id`;
  if (ended.length) {
    await audit(sql, {
      actor: user.employeeId,
      subject: user.employeeId,
      event: "other_sessions_signed_out",
      detail: { count: ended.length },
    });
  }
  return {
    ok: true,
    data: { ended: ended.length },
    message: ended.length
      ? `${ended.length} other session(s) were signed out.`
      : "You're not signed in anywhere else.",
  };
}

/** What has happened to this account lately, so an owner can spot what they didn't do. */
export async function listMyActivity(): Promise<AuthResult<AccountActivity[]>> {
  const user = await requireUser();
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id, event, ip, created_at from auth_audit
    where subject_id = ${user.employeeId}
    order by created_at desc
    limit 30`;
  return {
    ok: true,
    data: rows.map((r) => ({
      id: String(r["id"]),
      event: r["event"]!,
      at: iso(r["created_at"])!,
      ip: r["ip"] ?? null,
    })),
  };
}
