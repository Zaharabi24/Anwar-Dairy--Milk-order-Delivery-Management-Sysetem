// Employees registering themselves in the Employee Database.
//
// Signing in from the directory needs no password: a company email and an Employee ID that
// belong to the same active row are enough. That makes being in the directory the whole of
// access, so nobody can be allowed to add themselves under an address they don't own -- they
// could then book, on payroll deduction, in a colleague's name. So the form only writes an
// inactive row and mails a one-time link to the company address. Following it switches the row
// on, grants the employee role and signs them in; from then on they are an ordinary entry,
// emailed every batch.
//
// Unauthenticated by design, so everything is checked here: the company domain, the ID's shape,
// that neither the ID nor the address is already somebody's, and a limit per network address.
import { getDb, type Tx } from "../db/client.server";
import { randomToken, sha256 } from "./crypto.server";
import { appUrl, clientIp, startSession } from "./session.server";
import { button, escapeHtml, layout, sendMailDetailed } from "./mail.server";
import { AppError } from "@/lib/app-error";
import {
  registrationInput,
  type RegistrationInput,
  type RegistrationOptions,
  type VerifyRegistrationResult,
} from "@/lib/registration.schemas";

type Row = Record<string, string | number | boolean | Date | null>;

/** Registrations one network address may start in an hour. */
const MAX_PER_HOUR = 5;
/** How long the emailed link works. */
const LINK_HOURS = 48;

const suggestions = (rows: Row[], key: string) =>
  rows.map((r) => (r[key] as string) ?? "").filter((v) => v.trim().length > 0);

/** The business units, and department/designation/location values already in use. */
export async function getRegistrationOptions(): Promise<RegistrationOptions> {
  const sql = await getDb();
  const [units, departments, designations, locations] = await Promise.all([
    sql<Row[]>`select code, name from business_units where is_active order by position, name`,
    sql<Row[]>`select distinct department from employees
               where deleted_at is null order by department limit 100`,
    sql<Row[]>`select distinct designation from employees
               where deleted_at is null order by designation limit 200`,
    sql<Row[]>`select distinct site from employees
               where deleted_at is null order by site limit 100`,
  ]);
  return {
    businessUnits: units.map((u) => ({ code: u["code"] as string, name: u["name"] as string })),
    departments: suggestions(departments, "department"),
    designations: suggestions(designations, "designation"),
    locations: suggestions(locations, "site"),
  };
}

/**
 * A row that is only an unfinished self-registration: never confirmed, never switched on, no
 * account. Registering again replaces it, so a typo in the form isn't a dead end.
 */
async function isUnconfirmedRegistration(tx: Tx, employeeId: string): Promise<boolean> {
  const [row] = await tx<Row[]>`
    select 1 from employees e
    where e.id = ${employeeId} and not e.active and e.account_status is null
      and e.deleted_at is null
      and exists (select 1 from employee_registrations r
                  where r.employee_id = e.id and r.verified_at is null)
      and not exists (select 1 from employee_registrations r
                      where r.employee_id = e.id and r.verified_at is not null)
      and not exists (select 1 from orders o where o.employee_id = e.id)`;
  return Boolean(row);
}

/** Starts a registration and mails the confirmation link. Returns where it was sent. */
export async function registerEmployee(raw: RegistrationInput): Promise<{ email: string }> {
  const parsed = registrationInput.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const input = parsed.data;
  const ip = clientIp();
  const token = randomToken(32);
  const sql = await getDb();

  const name = await sql.begin(async (tx) => {
    // One registration at a time, so two submissions can't both pass the checks below.
    await tx`select pg_advisory_xact_lock(7210432)`;

    if (ip) {
      const [{ recent }] = (await tx<Row[]>`
        select count(*)::int as recent from employee_registrations
        where ip = ${ip} and created_at > now() - interval '1 hour'`) as unknown as [
        { recent: number },
      ];
      if (recent >= MAX_PER_HOUR) {
        throw new AppError("Too many registrations from here in the last hour. Try again later.");
      }
    }

    const [unit] = await tx<Row[]>`
      select code from business_units where code = ${input.businessUnitCode} and is_active`;
    if (!unit) throw new AppError("Choose one of the business units.");

    const listed =
      "is already in the Employee Database. Sign in with your company email and Employee ID, or ask a System Admin.";

    // The ID, deleted rows included: the primary key counts them all.
    const [byId] = await tx<Row[]>`
      select id, company_email, deleted_at from employees
      where lower(id) = lower(${input.employeeId}) for update`;
    if (byId) {
      if (byId["deleted_at"]) {
        throw new AppError(
          `Employee ID ${input.employeeId} can't be registered here. Ask a System Admin to add you.`,
        );
      }
      const own = await isUnconfirmedRegistration(tx, byId["id"] as string);
      const sameEmail =
        ((byId["company_email"] as string) ?? "").toLowerCase() === input.companyEmail;
      if (!own || !sameEmail) throw new AppError(`Employee ID ${input.employeeId} ${listed}`);
    }

    // The address, on anybody else's row.
    const others = await tx<Row[]>`
      select id from employees
      where lower(company_email) = ${input.companyEmail} and deleted_at is null
        and lower(id) <> lower(${input.employeeId})`;
    for (const other of others) {
      // An unconfirmed registration under a mistyped ID gives way to this one.
      if (await isUnconfirmedRegistration(tx, other["id"] as string)) {
        await tx`delete from employees where id = ${other["id"] as string}`;
      } else {
        throw new AppError(`${input.companyEmail} ${listed}`);
      }
    }

    const details = {
      name: input.name,
      company_email: input.companyEmail,
      phone: input.phone,
      department: input.department,
      designation: input.designation,
      site: input.site,
      floor_no: input.floorNo || null,
      business_unit_code: input.businessUnitCode,
    };
    if (byId) {
      // Registering again before confirming: the details are replaced and a fresh link sent.
      await tx`update employees set ${tx(details)}, updated_at = now()
               where id = ${byId["id"] as string}`;
      await tx`delete from employee_registrations
               where employee_id = ${byId["id"] as string} and verified_at is null`;
    } else {
      // Inactive until the link is followed: not emailed, not bookable, can't sign in.
      await tx`insert into employees ${tx({ id: input.employeeId, ...details, active: false })}`;
    }
    const employeeId = (byId?.["id"] as string) ?? input.employeeId;

    await tx`
      insert into employee_registrations (employee_id, token_hash, expires_at, ip)
      values (${employeeId}, ${sha256(token)},
              now() + make_interval(hours => ${LINK_HOURS}), ${ip})`;
    await tx`
      insert into audit_logs (actor, action, record, old_value, new_value)
      values (${`${input.name} (self-registration)`}, 'Registered in Employee Database',
              ${employeeId}, '—', 'Awaiting email confirmation')`;
    return input.name;
  });

  const link = `${appUrl()}/verify-registration?token=${token}`;
  const sent = await sendMailDetailed({
    to: input.companyEmail,
    subject: "Confirm your Anwar Organic registration",
    template: "employee_registration",
    html: layout(
      "Confirm your registration",
      `<p>Dear ${escapeHtml(name)},</p>
       <p>You asked to be added to the Anwar Organic employee list with Employee ID
       <strong>${escapeHtml(input.employeeId)}</strong>. Confirm it's you and you're done: you'll
       be signed in, and every new batch of milk will be emailed to you.</p>
       ${button(link, "Confirm my registration")}
       <p style="font-size:13px;color:#64748B;">The link works for ${LINK_HOURS} hours. After that,
       sign in with this company email and your Employee ID. If you didn't ask for this, ignore
       this email and nothing happens.</p>`,
    ),
  });
  if (sent.delivery === "failed") {
    // Local development without a mail server: the link is in the server log so the flow can
    // still be finished. Never in production, where the email is the proof of ownership.
    if (process.env["NODE_ENV"] !== "production") {
      console.info(`[register] mail failed; confirmation link for ${input.companyEmail}: ${link}`);
    }
    throw new AppError(
      "You're registered, but the confirmation email couldn't be sent. Try again in a few minutes.",
    );
  }
  return { email: input.companyEmail };
}

/** Follows the emailed link: switches the row on, grants the employee role and signs them in. */
export async function verifyRegistration(token: string): Promise<VerifyRegistrationResult> {
  if (!token || token.length < 20) return { status: "invalid" };
  const sql = await getDb();

  const result = await sql.begin(async (tx): Promise<VerifyRegistrationResult> => {
    const [reg] = await tx<Row[]>`
      select r.id, r.employee_id, r.expires_at, r.verified_at, e.name, e.deleted_at
      from employee_registrations r
      join employees e on e.id = r.employee_id
      where r.token_hash = ${sha256(token)}
      for update of r`;
    if (!reg || reg["deleted_at"]) return { status: "invalid" };
    // A link opens one session, once. After that they sign in like everyone else.
    if (reg["verified_at"]) return { status: "already" };
    if (new Date(reg["expires_at"] as Date).getTime() < Date.now()) return { status: "expired" };

    const employeeId = reg["employee_id"] as string;
    await tx`update employee_registrations set verified_at = now() where id = ${reg["id"] as string}`;
    await tx`update employees set active = true, updated_at = now() where id = ${employeeId}`;
    await tx`
      insert into user_roles (employee_id, role, granted_by)
      values (${employeeId}, 'employee', 'Self-registration')
      on conflict do nothing`;
    await tx`
      insert into audit_logs (actor, action, record, old_value, new_value)
      values (${`${reg["name"] as string} (self-registration)`},
              'Confirmed registration', ${employeeId}, 'Inactive', 'Active')`;
    // The same session the directory sign-in opens: the employee role and nothing else.
    await startSession(tx, employeeId, "employee", "employee", { origin: "directory" });
    return { status: "verified", name: reg["name"] as string };
  });

  if (result.status === "verified") {
    // A batch already open is sent to them now rather than at the next publish.
    void import("../mail/mail-queue.server").then((m) => m.mailLatecomersInBackground());
  }
  return result;
}
