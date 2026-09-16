// Cookie-backed sessions. The browser only ever holds a random token; the
// database stores its SHA-256 hash, so a leaked table can't be replayed.
import {
  deleteCookie,
  getCookie,
  getRequestHeader,
  getRequestIP,
  getRequestUrl,
  setCookie,
} from "@tanstack/react-start/server";
import { getDb, type Sql, type Tx } from "../db/client.server";
import { randomToken, sha256 } from "./crypto.server";
import { AppError } from "@/lib/app-error";
import {
  isRoleValue,
  isStaffRole,
  pickDefaultRole,
  type Portal,
  type RoleValue,
} from "@/lib/auth-constants";
import type { AuthUser } from "@/lib/auth-types";
import { hasPermission, type Permission } from "@/lib/permissions";

const COOKIE_NAME = "af_session";

/**
 * How long a session survives without activity.
 *
 * Parsed defensively: an empty value is what a hosting panel writes when the variable is added
 * but left blank, and Number("") is 0 -- which would set expires_at to now() and maxAge to 0,
 * signing every user out on their very next request.
 */
const SESSION_TTL_DAYS = (() => {
  const raw = process.env["SESSION_TTL_DAYS"]?.trim();
  const days = raw ? Number(raw) : Number.NaN;
  if (raw && !(Number.isFinite(days) && days > 0)) {
    console.warn(`[auth] SESSION_TTL_DAYS=${raw} is not a positive number; using 7 days.`);
  }
  return Number.isFinite(days) && days > 0 ? days : 7;
})();
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;

export interface SessionUser extends AuthUser {
  sessionId: string;
}

export function clientIp(): string | null {
  // Behind Dokploy's Traefik the socket address is the proxy; X-Forwarded-For carries the client.
  return getRequestIP({ xForwardedFor: true }) ?? null;
}

/** Base URL for links in emails: APP_URL when set, otherwise the URL the request came in on. */
export function appUrl(): string {
  const configured = process.env["APP_URL"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return getRequestUrl({ xForwardedHost: true, xForwardedProto: true }).origin;
}

function isHttps(): boolean {
  if (process.env["COOKIE_SECURE"] === "true") return true;
  if (process.env["COOKIE_SECURE"] === "false") return false;
  // APP_URL is how people actually reach the app, so it answers this identically on every request.
  // Reading X-Forwarded-Proto instead lets the answer change when a proxy hop or a health check
  // arrives without the header, and a cookie marked secure is silently dropped by a browser on
  // http -- which looks exactly like being signed out at random.
  const configured = process.env["APP_URL"]?.trim();
  if (configured) {
    try {
      return new URL(configured).protocol === "https:";
    } catch {
      // Not a URL we can read; fall back to the request below.
    }
  }
  return getRequestUrl({ xForwardedProto: true }).protocol === "https:";
}

/** The cookie's attributes. Set and delete must agree on these or the browser keeps a stale one. */
const sessionCookie = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isHttps(),
  path: "/",
});

/** (Re)issues the session cookie with a full lifetime ahead of it. */
function issueSessionCookie(token: string): void {
  setCookie(COOKIE_NAME, token, { ...sessionCookie(), maxAge: SESSION_TTL_SECONDS });
}

/** All roles the account holds, straight from the database. */
export async function activeRoles(db: Sql | Tx, employeeId: string): Promise<RoleValue[]> {
  const rows = await db<{ role: string }[]>`
    select role from user_roles where employee_id = ${employeeId} and revoked_at is null`;
  return rows.map((r) => r.role).filter(isRoleValue);
}

/**
 * The roles a session may use. Employee-portal sessions are limited to the employee role;
 * staff-portal sessions need at least one staff role and may also use the employee role.
 */
export function rolesForPortal(held: RoleValue[], portal: Portal): RoleValue[] {
  if (portal === "employee") return held.filter((r) => r === "employee");
  return held.some(isStaffRole) ? held : [];
}

/**
 * Ends whatever session this browser is currently holding. Signing in as someone else replaces
 * the cookie either way; revoking the row as well means the old token can't still be redeemed if
 * it was captured, so the new person never inherits the previous person's access.
 */
export async function revokeCurrentSession(db: Sql | Tx): Promise<void> {
  const token = getCookie(COOKIE_NAME);
  if (!token) return;
  await db`
    update sessions set revoked_at = now()
    where token_hash = ${sha256(token)} and revoked_at is null`;
}

/** Starts a session for an active account and sets the cookie on the current response. */
export async function startSession(
  db: Sql | Tx,
  employeeId: string,
  role: RoleValue,
  portal: Portal = "employee",
): Promise<void> {
  // Every sign-in goes through here, so this is the one place that has to retire the old session.
  await revokeCurrentSession(db);
  const token = randomToken(32);
  await db`
    insert into sessions (token_hash, employee_id, active_role, portal, ip, user_agent, expires_at)
    values (${sha256(token)}, ${employeeId}, ${role}, ${portal}, ${clientIp()},
            ${getRequestHeader("user-agent")?.slice(0, 300) ?? null},
            now() + make_interval(days => ${SESSION_TTL_DAYS}))`;
  issueSessionCookie(token);
}

export function clearSessionCookie(): void {
  deleteCookie(COOKIE_NAME, sessionCookie());
}

/** The signed-in user, or null. Roles are re-read from the database on every request. */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Runs on every page load, so the first request (or healthcheck) applies migrations.
  const sql = await getDb();
  const token = getCookie(COOKIE_NAME);
  if (!token) return null;

  const [row] = await sql<
    {
      session_id: string;
      active_role: string;
      portal: Portal;
      employee_id: string;
      name: string;
      company_email: string;
      stale: boolean;
    }[]
  >`
    select s.id as session_id, s.active_role, s.portal, e.id as employee_id, e.name, e.company_email,
           s.last_seen_at < now() - interval '5 minutes' as stale
    from sessions s
    join employees e on e.id = s.employee_id
    where s.token_hash = ${sha256(token)}
      and s.revoked_at is null
      and s.expires_at > now()
      and e.account_status = 'active'`;
  if (!row) {
    clearSessionCookie();
    return null;
  }

  const roles = rolesForPortal(await activeRoles(sql, row.employee_id), row.portal);
  if (roles.length === 0) {
    // e.g. staff access was removed: the staff session ends immediately.
    await sql`update sessions set revoked_at = now() where id = ${row.session_id}`;
    clearSessionCookie();
    return null;
  }

  // A role revoked since sign-in stops working on the very next request.
  let activeRole =
    isRoleValue(row.active_role) && roles.includes(row.active_role) ? row.active_role : null;
  if (!activeRole || row.stale) {
    activeRole ??= pickDefaultRole(roles);
    // Being used counts as staying signed in: the expiry moves forward and the cookie is reissued
    // with it. Without this a session dies a fixed number of days after sign-in however active the
    // person is, which is a sign-out in the middle of their work rather than one they'd expect.
    // Idle sessions still lapse, SESSION_TTL_DAYS after the last request.
    await sql`
      update sessions
      set active_role = ${activeRole}, last_seen_at = now(),
          expires_at = now() + make_interval(days => ${SESSION_TTL_DAYS})
      where id = ${row.session_id}`;
    issueSessionCookie(token);
  }

  return {
    sessionId: row.session_id,
    employeeId: row.employee_id,
    fullName: row.name,
    companyMail: row.company_email,
    roles,
    activeRole,
    portal: row.portal,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AppError("Your session has ended. Please sign in again.");
  return user;
}

/** Requires a signed-in user holding at least one of the given roles in this session. */
export async function requireRole(...allowed: RoleValue[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!allowed.some((role) => user.roles.includes(role))) {
    throw new AppError("You don't have access to do that.");
  }
  return user;
}

/** Requires a signed-in user whose session roles grant the permission. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.roles, permission)) {
    throw new AppError("You don't have access to do that.");
  }
  return user;
}

export async function revokeAllSessions(
  db: Sql | Tx,
  employeeId: string,
  portal?: Portal,
): Promise<void> {
  await db`
    update sessions set revoked_at = now()
    where employee_id = ${employeeId} and revoked_at is null
      and (${portal ?? null}::text is null or portal = ${portal ?? null})`;
}
