// Signing in against the Employee Database.
//
// An employee gives their company email and their employee ID. If the two belong to the same
// active person in the directory, they get a session and can book. There is no password, because
// there is no account: eligibility is the directory, which is the same rule the emailed booking
// link already runs on.
//
// What this is, plainly: a company email and an employee ID are both things colleagues know, and
// neither is secret. This establishes *who is ordering*, not that they are who they say. For milk
// ordered against a name that is a reasonable trade, and it is the trust the booking link already
// extends. What keeps it honest is the ceiling on it -- the session it opens holds the employee
// role and nothing else, so it can book milk and see its own orders, and it cannot reach a single
// staff screen. Staff still sign in with a password.
//
// The two things that would make it worse are both guarded. Employee IDs here are six sequential
// digits, so somebody could walk them; the lockout counts failures against both identifiers
// together and stops that at the same threshold a password sign-in uses. And the answer to a bad
// attempt never says which half was wrong, so it can't be used to confirm that an address exists.
import { getDb } from "../db/client.server";
import { audit, fail, failuresFor, logAttempt, LOCK_MINUTES } from "./auth.server";
import { startSession } from "./session.server";
import type { AuthResult, AuthUser } from "@/lib/auth-types";
import type { DirectorySignInInput } from "@/lib/auth.schemas";

type Row = Record<string, string | number | boolean | Date | null>;

/** Deliberately says nothing about which half didn't match. */
const GENERIC = "We couldn't match that company email and Employee ID. Check both and try again.";

/** Failures inside the window before the pair is locked out. Matches the password sign-in. */
const MAX_FAILURES = 5;

export async function signInFromDirectory(
  input: DirectorySignInInput,
): Promise<AuthResult<{ profile: AuthUser }>> {
  const sql = await getDb();
  const email = input.companyEmail.trim().toLowerCase();
  const employeeId = input.employeeId.trim();

  // Counted against both identifiers, so alternating between them doesn't buy extra attempts.
  if ((await failuresFor(sql, [email, employeeId])) >= MAX_FAILURES) {
    await logAttempt(sql, email, "locked", "employee");
    return fail(`Too many attempts. Try again in ${LOCK_MINUTES} minutes.`);
  }

  // Both halves must belong to the same row. Matching them separately would let any real address
  // pair with any real ID, which is not a check at all.
  const [employee] = await sql<Row[]>`
    select e.id, e.name, e.company_email
    from employees e
    where lower(e.company_email) = ${email}
      and lower(e.id) = ${employeeId.toLowerCase()}
      and e.active
      and e.deleted_at is null
      and exists (select 1 from user_roles r
                  where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)`;

  if (!employee) {
    await logAttempt(sql, email, "directory_no_match", "employee");
    await audit(sql, {
      event: "directory_sign_in_failed",
      detail: { email, employeeId },
    });
    return fail(GENERIC);
  }

  const id = employee["id"] as string;
  await logAttempt(sql, email, "success", "employee");
  await audit(sql, { subject: id, event: "login_success", detail: { via: "directory" } });
  await sql`update employees set last_login_at = now() where id = ${id}`;

  // The employee portal, so the session can only ever act as an employee -- even if this person
  // also holds a staff role, which is reached by signing in with a password and not from here.
  await startSession(sql, id, "employee", "employee", { origin: "directory" });

  return {
    ok: true,
    data: {
      profile: {
        employeeId: id,
        fullName: employee["name"] as string,
        companyMail: employee["company_email"] as string,
        roles: ["employee"],
        activeRole: "employee",
        portal: "employee",
        withoutAccount: true,
      },
    },
  };
}
