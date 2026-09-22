// Staff invitations: a Super Admin invites an email address to a staff role; the invitee
// accepts through a single-use emailed link and lands signed in on the staff portal.
//
// Token model: 32 random bytes (base64url) in the link, only SHA-256 in the database.
// Opening a link never consumes it. Resending or copying a link rotates the token, so
// only the newest link works. Acceptance consumes it inside one transaction.
import { getDb, type Sql, type Tx } from "../db/client.server";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto.server";
import {
  button,
  escapeHtml,
  layout,
  sendMail,
  sendMailDetailed,
  type MailMessage,
} from "./mail.server";
import {
  activeRoles,
  appUrl,
  clientIp,
  requirePermission,
  rolesForPortal,
  startSession,
} from "./session.server";
import { LOCK_AFTER, LOCK_MINUTES, audit, fail, failuresFor, iso, logAttempt } from "./auth.server";
import {
  ALLOWED_EMAIL_DOMAIN,
  INVITABLE_ROLES,
  isRoleValue,
  isStaffRole,
  roleLabel,
  type InvitableRole,
} from "@/lib/auth-constants";
import type {
  AuthResult,
  AuthUser,
  FieldErrors,
  InvitationPreview,
  InvitationRow,
  InvitationSent,
  MailDelivery,
  StaffMemberRow,
  TeamData,
} from "@/lib/auth-types";
import { validateConfirm, validatePassword, validateEmployeeId } from "@/lib/auth-validation";
import type { AcceptInvitationInput, CreateInvitationInput } from "@/lib/auth.schemas";
import { canManageAccount } from "@/lib/permissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const INVITE_TTL_HOURS = Number(process.env["INVITE_TTL_HOURS"] ?? 72);
const MAX_INVITES_PER_HOUR = 50;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_TOKEN_FAILURES_PER_HOUR = 30;

const inviteUrl = (raw: string, base = appUrl()) => `${base}/accept-invite?token=${raw}`;

function toInvitationRow(r: Row): InvitationRow {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    employeeId: r.employee_id,
    role: r.role,
    status: r.status,
    invitedBy: r.invited_by_name ? `${r.invited_by_name} (${r.invited_by})` : r.invited_by,
    createdAt: iso(r.created_at)!,
    lastSentAt: iso(r.last_sent_at)!,
    sendCount: r.send_count,
    expiresAt: iso(r.expires_at)!,
    acceptedAt: iso(r.accepted_at),
    acceptedEmployeeId: r.accepted_employee_id,
    revokedAt: iso(r.revoked_at),
  };
}

const expireStale = (db: Tx | Sql) =>
  db`update invitations set status = 'expired' where status = 'pending' and expires_at < now()`;

function invitationEmail(input: {
  to: string;
  name: string | null;
  role: string;
  inviter: string;
  link: string;
  expiresAt: Date;
}): MailMessage {
  const expires = input.expiresAt.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return {
    to: input.to,
    subject: `You're invited to Anwar Organic as ${roleLabel(input.role)}`,
    template: "staff_invitation",
    html: layout(
      "You've been invited to Anwar Organic",
      `<p>Hello${input.name ? ` ${escapeHtml(input.name)}` : ""},</p>
       <p><strong>${escapeHtml(input.inviter)}</strong> invited you to join Anwar Organic as
       <strong>${escapeHtml(roleLabel(input.role))}</strong>.</p>
       <p>Accept the invitation to set up your account. You'll be signed in straight away.</p>
       ${button(input.link, "Accept invitation")}
       <p style="font-size:13px;color:#64748B;">This invitation is for ${escapeHtml(input.to)} and
       expires on ${escapeHtml(expires)} (Dhaka time). If you weren't expecting it, you can ignore
       this email.</p>`,
    ),
  };
}

async function inviterName(db: Tx | Sql, employeeId: string | null): Promise<string> {
  if (!employeeId) return "The Anwar Organic administrator";
  const [row] = await db<Row[]>`select name from employees where id = ${employeeId}`;
  return row?.name ?? "The Anwar Organic administrator";
}

// ---------------------------------------------------------------------------
// Super Admin: team overview

export async function listTeam(): Promise<AuthResult<TeamData>> {
  const actor = await requirePermission("staff.manage");
  const sql = await getDb();
  await expireStale(sql);

  const [invitations, members] = await Promise.all([
    sql<Row[]>`
      select i.*, inviter.name as invited_by_name
      from invitations i
      left join employees inviter on inviter.id = i.invited_by
      order by i.created_at desc
      limit 1000`,
    sql<Row[]>`
      select e.id, e.name, e.company_email, e.account_status, e.last_login_at,
             coalesce(e.activated_at, e.created_at) as joined_at,
             array_agg(r.role order by r.role) as roles
      from employees e
      join user_roles r on r.employee_id = e.id and r.revoked_at is null
      where e.account_status is not null
      group by e.id
      having bool_or(r.role <> 'employee')
      order by e.name`,
  ]);

  return {
    ok: true,
    data: {
      invitations: invitations.map(toInvitationRow),
      members: members.map((m): StaffMemberRow => {
        const roles = (m.roles as string[]).filter(isRoleValue);
        return {
          employeeId: m.id,
          fullName: m.name,
          email: m.company_email,
          roles,
          status: m.account_status,
          lastLoginAt: iso(m.last_login_at),
          joinedAt: iso(m.joined_at)!,
          manageable: m.id !== actor.employeeId && canManageAccount(actor.roles, roles),
        };
      }),
    },
  };
}

// ---------------------------------------------------------------------------
// Super Admin: invite, resend, revoke, copy link

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<AuthResult<InvitationSent>> {
  const actor = await requirePermission("staff.invite");
  const email = input.email.trim().toLowerCase();
  const fullName = input.full_name?.trim() || null;
  const employeeId = input.employee_id?.trim() || null;
  const role: InvitableRole = input.role;

  const errors: FieldErrors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors["email"] = "Enter a valid email address.";
  else if (!email.endsWith("@" + ALLOWED_EMAIL_DOMAIN))
    errors["email"] = "The mail domain doesn't match.";
  if (!INVITABLE_ROLES.some((r) => r.value === role)) errors["role"] = "Choose a role.";
  if (employeeId) {
    const idError = validateEmployeeId(employeeId);
    if (idError) errors["employee_id"] = idError;
  }
  if (Object.keys(errors).length) return fail("Please fix the highlighted fields.", errors);
  if (email === actor.companyMail.toLowerCase()) return fail("You can't invite yourself.");

  const sql = await getDb();
  const outcome = await sql.begin(
    async (tx): Promise<AuthResult<InvitationRow> & { mail?: MailMessage }> => {
      // Serialise invitations per address so two admins can't race each other.
      await tx`select pg_advisory_xact_lock(hashtext(${`invite:${email}`}))`;
      await expireStale(tx);

      const [{ recent }] = (await tx<Row[]>`
      select count(*)::int as recent from invitations
      where invited_by = ${actor.employeeId} and created_at > now() - interval '1 hour'`) as unknown as [
        { recent: number },
      ];
      if (recent >= MAX_INVITES_PER_HOUR)
        return fail("You've sent a lot of invitations. Try again in an hour.");

      const [account] = await tx<Row[]>`
      select id, name, account_status from employees where lower(company_email) = ${email}`;
      // A suspended account is a deliberate hold, so an invitation must not become a way around
      // it. A deactivated one is someone who was removed from the team or from the system, and
      // inviting them back is how they return: accepting reactivates the record they already
      // have, which keeps their Employee ID and their order history attached to them.
      if (account?.account_status === "suspended") {
        return fail(`${account.name}'s account is suspended. Reactivate it in Accounts first.`, {
          email: "This account is suspended.",
        });
      }
      // Only a live account can genuinely already hold the role. A deactivated one can't sign in,
      // so a role still on its record isn't a clash -- it is what the invitation brings back, and
      // Deactivate leaves roles in place where Remove access revokes them.
      if (account?.account_status && account.account_status !== "deactivated") {
        const roles = await activeRoles(tx, account.id);
        if (roles.includes(role)) {
          return fail(`${account.name} is already ${roleLabel(role)}.`, {
            email: "Already has this role.",
          });
        }
        if (roles.some(isStaffRole)) {
          return fail(
            `${account.name} is already on the employee team. Change their role from the Members list.`,
            {
              email: "Already an employee member.",
            },
          );
        }
      }
      if (employeeId) {
        // A deleted account keeps its employees row so its orders still have an owner, and its
        // address is moved aside. That record is the same person's history, not someone else's
        // claim on the ID, so it must not block inviting them back.
        const [owner] = await tx<Row[]>`
        select company_email from employees
        where lower(id) = lower(${employeeId}) and deleted_at is null`;
        if (owner && owner.company_email.toLowerCase() !== email) {
          return fail("That Employee ID belongs to someone else.", {
            employee_id: "This Employee ID belongs to a different email.",
          });
        }
        if (account && account.id.toLowerCase() !== employeeId.toLowerCase()) {
          return fail(`This email already belongs to ${account.id}.`, {
            employee_id: `This email is already linked to ${account.id}.`,
          });
        }
      }

      const [pending] = await tx<Row[]>`
      select id from invitations where email = ${email} and status = 'pending'`;
      if (pending) {
        return fail(
          "There's already a pending invitation for this email. Resend it from the list instead.",
          {
            email: "A pending invitation already exists.",
          },
        );
      }

      const raw = randomToken(32);
      const [row] = await tx<Row[]>`
      insert into invitations (email, full_name, employee_id, role, token_hash, invited_by, expires_at)
      values (${email}, ${fullName}, ${employeeId}, ${role}, ${sha256(raw)}, ${actor.employeeId},
              now() + make_interval(hours => ${INVITE_TTL_HOURS}))
      returning *`;
      await audit(tx, {
        actor: actor.employeeId,
        subject: account?.id ?? null,
        event: "invitation_created",
        detail: { email, role, invitation_id: row.id },
      });

      return {
        ok: true,
        data: toInvitationRow({ ...row, invited_by_name: actor.fullName }),
        mail: invitationEmail({
          to: email,
          name: fullName ?? account?.name ?? null,
          role,
          inviter: actor.fullName,
          link: inviteUrl(raw),
          expiresAt: new Date(row.expires_at),
        }),
      };
    },
  );

  const { mail, data, ...rest } = outcome;
  if (!outcome.ok || !data) return rest;
  const sent = mail ? await sendMailDetailed(mail) : { delivery: "failed" as const };
  return {
    ...rest,
    data: {
      invitation: data,
      delivery: sent.delivery,
      ...(sent.error ? { mailError: sent.error } : {}),
    },
  };
}

/** Rotates the token and extends expiry. Used by resend (emails it) and copy-link (returns it). */
async function reissue(
  invitationId: string,
  mode: "resend" | "copy",
): Promise<
  AuthResult<{
    invitation: InvitationRow;
    delivery?: MailDelivery;
    mailError?: string;
    link?: string;
  }>
> {
  const actor = await requirePermission("staff.invite");
  const sql = await getDb();
  const outcome = await sql.begin(async (tx) => {
    await expireStale(tx);
    const [inv] = await tx<Row[]>`select * from invitations where id = ${invitationId} for update`;
    if (!inv) return { result: fail<never>("Invitation not found.") };
    if (inv.status !== "pending" && inv.status !== "expired") {
      return { result: fail<never>(`This invitation was already ${inv.status}.`) };
    }
    if (inv.role === "super_admin")
      return { result: fail<never>("Super Admin invitations are managed by the server.") };
    if (
      mode === "resend" &&
      inv.status === "pending" &&
      Date.now() - new Date(inv.last_sent_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000
    ) {
      return { result: fail<never>("It was just sent. Wait a minute before resending.") };
    }
    if (inv.status === "expired") {
      // Reopening: make sure no newer pending invitation took its place.
      const [other] = await tx<Row[]>`
        select 1 from invitations where email = ${inv.email} and status = 'pending' and id <> ${inv.id}`;
      if (other)
        return { result: fail<never>("There's a newer pending invitation for this email.") };
    }

    const raw = randomToken(32);
    const [row] = await tx<Row[]>`
      update invitations set token_hash = ${sha256(raw)}, status = 'pending',
        expires_at = now() + make_interval(hours => ${INVITE_TTL_HOURS}),
        last_sent_at = now(), send_count = send_count + ${mode === "resend" ? 1 : 0}
      where id = ${inv.id}
      returning *`;
    await audit(tx, {
      actor: actor.employeeId,
      event: mode === "resend" ? "invitation_resent" : "invitation_link_created",
      detail: { email: inv.email, role: inv.role, invitation_id: inv.id },
    });
    return {
      row,
      link: inviteUrl(raw),
      inviter: await inviterName(tx, inv.invited_by),
    };
  });

  if ("result" in outcome) return outcome.result;
  const invitation = toInvitationRow({ ...outcome.row, invited_by_name: outcome.inviter });
  if (mode === "copy") return { ok: true, data: { invitation, link: outcome.link } };
  const sent = await sendMailDetailed(
    invitationEmail({
      to: outcome.row.email,
      name: outcome.row.full_name,
      role: outcome.row.role,
      inviter: outcome.inviter,
      link: outcome.link,
      expiresAt: new Date(outcome.row.expires_at),
    }),
  );
  return {
    ok: true,
    data: { invitation, delivery: sent.delivery, ...(sent.error ? { mailError: sent.error } : {}) },
  };
}

export const resendInvitation = (invitationId: string) => reissue(invitationId, "resend");
export const copyInvitationLink = (invitationId: string) => reissue(invitationId, "copy");

export async function revokeInvitation(invitationId: string): Promise<AuthResult> {
  const actor = await requirePermission("staff.invite");
  const sql = await getDb();
  const [row] = await sql<Row[]>`
    update invitations set status = 'revoked', revoked_at = now(), revoked_by = ${actor.employeeId}
    where id = ${invitationId} and status in ('pending', 'expired') and role <> 'super_admin'
    returning email, role`;
  if (!row)
    return fail("This invitation can't be revoked (it may already be accepted or revoked).");
  await audit(sql, {
    actor: actor.employeeId,
    event: "invitation_revoked",
    detail: { email: row.email, role: row.role, invitation_id: invitationId },
  });
  return { ok: true, message: `Invitation for ${row.email} revoked. The link no longer works.` };
}

// ---------------------------------------------------------------------------
// Invitee: preview and accept

async function tokenLookupAllowed(sql: Sql): Promise<boolean> {
  const ip = clientIp();
  if (!ip) return true;
  const [row] = await sql<Row[]>`
    select count(*)::int as fails from login_attempts
    where ip = ${ip} and outcome = 'invite_token_fail' and attempted_at > now() - interval '1 hour'`;
  return (row?.fails ?? 0) < MAX_TOKEN_FAILURES_PER_HOUR;
}

async function findInvitation(sql: Sql | Tx, token: string, lock = false) {
  const [row] = lock
    ? await sql<Row[]>`select * from invitations where token_hash = ${sha256(token)} for update`
    : await sql<Row[]>`select * from invitations where token_hash = ${sha256(token)}`;
  return row as Row | undefined;
}

const INVALID = "This invitation link is invalid. Ask your Super Admin to send a new one.";

/** Checks a link without consuming it (mail scanners pre-open links). */
export async function previewInvitation(token: string): Promise<AuthResult<InvitationPreview>> {
  const sql = await getDb();
  if (!(await tokenLookupAllowed(sql))) return fail("Too many attempts. Try again later.");
  await expireStale(sql);

  const inv = await findInvitation(sql, token);
  if (!inv) {
    await logAttempt(sql, "invitation", "invite_token_fail");
    return { ok: true, data: { state: "invalid", message: INVALID } };
  }
  if (inv.status === "expired") {
    return {
      ok: true,
      data: {
        state: "expired",
        message: "This invitation has expired. Ask your Super Admin to resend it.",
      },
    };
  }
  if (inv.status === "revoked") {
    return { ok: true, data: { state: "revoked", message: "This invitation was withdrawn." } };
  }
  if (inv.status === "accepted") {
    return {
      ok: true,
      data: {
        state: "accepted",
        message: "This invitation has already been accepted. Sign in instead.",
      },
    };
  }

  const [account] = await sql<Row[]>`
    select id, name, account_status, password_hash is not null as has_password
    from employees where lower(company_email) = ${inv.email}`;
  // Same rule as createInvitation and acceptInvitation: a suspended account is a deliberate hold,
  // a deactivated one is someone being invited back, and the form below reactivates them. This is
  // the check the page runs on load, so leaving it out of that rule shut the door before the
  // person could even see the form.
  if (account?.account_status === "suspended") {
    return {
      ok: true,
      data: {
        state: "invalid",
        message: "The account for this email isn't active. Contact your Super Admin.",
      },
    };
  }

  return {
    ok: true,
    data: {
      state: "valid",
      email: inv.email,
      role: inv.role,
      fullName: inv.full_name ?? (account?.name || null),
      invitedBy: inv.invited_by ? await inviterName(sql, inv.invited_by) : null,
      expiresAt: iso(inv.expires_at)!,
      existingAccount:
        account?.account_status === "active" && account.has_password
          ? { employeeId: account.id, fullName: account.name }
          : null,
    },
  };
}

export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<AuthResult<{ profile: AuthUser }>> {
  const sql = await getDb();
  if (!(await tokenLookupAllowed(sql))) return fail("Too many attempts. Try again later.");

  // Accepting sets the password for anyone who doesn't already have one.
  //
  // The link proves the invitation reached the right mailbox; the password is what makes the
  // account theirs from then on, so the two are done together and neither is any use alone. An
  // address that already has a working account is the exception: the role is simply added to it,
  // and their existing password is neither asked for nor touched.

  type Outcome = AuthResult<{ profile: AuthUser }> & { notify?: { to: string; mail: MailMessage } };
  const outcome = await sql.begin(async (tx): Promise<Outcome> => {
    const inv = await findInvitation(tx, input.token, true);
    if (!inv) {
      await logAttempt(tx, "invitation", "invite_token_fail");
      return fail(INVALID);
    }
    if (inv.status !== "pending" || new Date(inv.expires_at).getTime() < Date.now()) {
      return fail(
        inv.status === "accepted"
          ? "This invitation has already been accepted. Sign in instead."
          : "This invitation is no longer valid. Ask your Super Admin to resend it.",
      );
    }

    const [account] = await tx<Row[]>`
      select id, name, account_status, password_hash from employees
      where lower(company_email) = ${inv.email} for update`;
    // Matches createInvitation: a suspended account stays blocked, a deactivated one is being
    // invited back and is reactivated below.
    if (account?.account_status === "suspended") {
      return fail("The account for this email isn't active. Contact your Super Admin.");
    }

    // Checked before anything is written, so an invitation is never spent on a password that
    // was going to be rejected. The same two rules the form applies, applied again here --
    // the form is a convenience, this is the check.
    const joining = !(account?.account_status === "active" && account.password_hash);
    const password = input.password ?? "";
    if (joining) {
      const bad =
        validatePassword(password) ?? validateConfirm(password, input.confirm ?? password);
      if (bad) return fail(bad, { password: bad });
    }

    let employeeId: string;
    let fullName: string;
    if (account?.account_status === "active" && account.password_hash) {
      // Already has an account: the role is simply added to it. Their password is not touched and
      // is not asked for -- the emailed link is what proves this is them, the same proof that
      // signs in a new joiner, and the same proof staff password reset already accepts.
      employeeId = account.id;
      fullName = account.name;
    } else {
      // A name if one was offered, otherwise the one the Super Admin typed on the invitation, and
      // failing both the address itself. Never a question put to the person: they clicked a link
      // to start work, and a name is something they can correct in Profile.
      const name =
        input.full_name?.trim() || inv.full_name?.trim() || inv.email.split("@")[0] || "New member";
      fullName = name;

      if (account) {
        // On the roster (or approved but never activated): activate that same record.
        employeeId = account.id;
        // Someone who was deactivated is coming back, so the record stops saying otherwise. The
        // roster flag is restored the way the explicit Reactivate action restores it -- on only
        // if they still hold the employee role -- and is left alone for every other status.
        await tx`
          update employees set name = ${name},
            account_status = 'active', activated_at = coalesce(activated_at, now()),
            active = case when account_status = 'deactivated'
                          then exists (select 1 from user_roles r
                                       where r.employee_id = employees.id
                                         and r.role = 'employee' and r.revoked_at is null)
                          else active end,
            deactivated_at = null, updated_at = now()
          where id = ${account.id}`;
      } else {
        // The Employee ID may belong to an account that was deleted. That row is kept only so the
        // person's past orders still have an owner, so taking it back up is the right move: it
        // restores their history to them, the same way approving a fresh sign-up does.
        const [previous] = inv.employee_id
          ? await tx<Row[]>`
              select id, deleted_at from employees where lower(id) = lower(${inv.employee_id})
              for update`
          : [];
        if (previous && !previous.deleted_at) {
          return fail(
            "This invitation's Employee ID is already in use. Ask your Super Admin to resend it.",
          );
        }

        if (previous) {
          employeeId = previous.id;
          await tx`
            update employees set name = ${name}, company_email = ${inv.email},
              account_status = 'active', active = false,
              activated_at = coalesce(activated_at, now()),
              deleted_at = null, deleted_by = null, former_company_email = null,
              deactivated_at = null, updated_at = now()
            where id = ${previous.id}`;
        } else {
          const [created] = await tx<Row[]>`
            insert into employees (id, name, company_email, phone, department, site, active,
                                   account_status, activated_at)
            values (coalesce(${inv.employee_id}::text, 'STF-' || lpad(nextval('staff_id_seq')::text, 4, '0')),
                    ${name}, ${inv.email}, '', 'Admin', 'Head Office – Gulshan', false,
                    'active', now())
            returning id`;
          employeeId = created.id;
        }
      }
    }

    // Hashed with the same function every other password in the system uses; the plain one is
    // never written anywhere, and never leaves this request.
    if (joining) {
      await tx`
        update employees set password_hash = ${await hashPassword(password)},
          account_status = 'active', activated_at = coalesce(activated_at, now()),
          updated_at = now()
        where id = ${employeeId}`;
    }

    await tx`insert into user_roles (employee_id, role, granted_by)
             values (${employeeId}, ${inv.role}, ${inv.invited_by})
             on conflict do nothing`;
    await tx`
      update invitations set status = 'accepted', accepted_at = now(), accepted_employee_id = ${employeeId}
      where id = ${inv.id}`;
    // Any other open invitations for this address are now moot.
    await tx`
      update invitations set status = 'revoked', revoked_at = now(), revoked_by = ${employeeId}
      where email = ${inv.email} and status = 'pending' and id <> ${inv.id}`;
    await tx`update employees set last_login_at = now() where id = ${employeeId}`;
    await audit(tx, {
      actor: inv.invited_by,
      subject: employeeId,
      event: "invitation_accepted",
      detail: {
        email: inv.email,
        role: inv.role,
        invitation_id: inv.id,
        existing_account: !!account?.password_hash,
      },
    });

    const roles = rolesForPortal(await activeRoles(tx, employeeId), "staff");
    await startSession(tx, employeeId, inv.role, "staff");
    await audit(tx, {
      subject: employeeId,
      event: "login_success",
      detail: { via: "invitation", portal: "staff", role: inv.role },
    });

    const [inviter] = inv.invited_by
      ? await tx<Row[]>`select name, company_email from employees where id = ${inv.invited_by}`
      : [];
    return {
      ok: true,
      data: {
        profile: {
          employeeId,
          fullName,
          companyMail: inv.email,
          roles,
          activeRole: inv.role,
          portal: "staff",
          withoutAccount: false,
        },
      },
      ...(inviter
        ? {
            notify: {
              to: inviter.company_email,
              mail: {
                to: inviter.company_email,
                subject: `${fullName} joined Anwar Organic as ${roleLabel(inv.role)}`,
                template: "invitation_accepted",
                html: layout(
                  "Your invitation was accepted",
                  `<p>Dear ${escapeHtml(inviter.name)},</p>
                   <p><strong>${escapeHtml(fullName)}</strong> (${escapeHtml(inv.email)}) accepted your
                   invitation and can now sign in as <strong>${escapeHtml(roleLabel(inv.role))}</strong>.</p>`,
                ),
              },
            },
          }
        : {}),
    };
  });

  const { notify, ...result } = outcome;
  if (notify) await sendMail(notify.mail);
  return result;
}

// ---------------------------------------------------------------------------
// Bootstrap: the first Super Admin

/**
 * Called during startup while no active Super Admin exists and SUPER_ADMIN_EMAIL is set.
 * With SUPER_ADMIN_PASSWORD the account is created directly; otherwise an invitation is
 * (re)issued, emailed and its link printed to the server log. Returns mail to send after commit.
 */
export async function bootstrapSuperAdmin(tx: Tx): Promise<MailMessage | null> {
  const email = process.env["SUPER_ADMIN_EMAIL"]?.trim().toLowerCase();
  if (!email) return null;
  const [exists] = await tx`
    select 1 from user_roles r join employees e on e.id = r.employee_id
    where r.role = 'super_admin' and r.revoked_at is null and e.account_status = 'active'`;
  if (exists) return null;

  if (!email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) {
    console.error(`[auth] SUPER_ADMIN_EMAIL must be an @${ALLOWED_EMAIL_DOMAIN} address.`);
    return null;
  }
  const name = process.env["SUPER_ADMIN_NAME"]?.trim() || "Super Admin";
  const employeeId = process.env["SUPER_ADMIN_EMPLOYEE_ID"]?.trim() || null;
  const password = process.env["SUPER_ADMIN_PASSWORD"];

  if (password) {
    if (password.length < 12)
      throw new Error("SUPER_ADMIN_PASSWORD must be at least 12 characters.");
    const passwordHash = await hashPassword(password);
    const [account] = await tx<
      Row[]
    >`select id from employees where lower(company_email) = ${email}`;
    let id: string;
    if (account) {
      id = account.id;
      await tx`update employees set account_status = 'active', password_hash = ${passwordHash},
               activated_at = coalesce(activated_at, now()) where id = ${id}`;
    } else {
      const [created] = await tx<Row[]>`
        insert into employees (id, name, company_email, phone, department, site, active,
                               account_status, password_hash, activated_at)
        values (coalesce(${employeeId}::text, 'STF-' || lpad(nextval('staff_id_seq')::text, 4, '0')),
                ${name}, ${email}, '', 'Admin', 'Head Office – Gulshan', false,
                'active', ${passwordHash}, now())
        returning id`;
      id = created.id;
    }
    await tx`insert into user_roles (employee_id, role) values (${id}, 'super_admin') on conflict do nothing`;
    await tx`insert into auth_audit (subject_id, event, detail)
             values (${id}, 'super_admin_bootstrapped', ${JSON.stringify({ method: "password" })}::jsonb)`;
    console.info(
      `[auth] created Super Admin ${email} (${id}). Remove SUPER_ADMIN_PASSWORD from the environment.`,
    );
    return null;
  }

  // Invitation-based bootstrap: every start while no Super Admin exists issues a fresh link.
  let base = process.env["APP_URL"]?.trim().replace(/\/+$/, "");
  if (!base) {
    try {
      base = appUrl();
    } catch {
      base = `http://localhost:${process.env["PORT"] ?? 3000}`;
    }
  }
  const raw = randomToken(32);
  await tx`update invitations set status = 'revoked', revoked_at = now(), revoked_by = 'system'
           where email = ${email} and status = 'pending'`;
  const [row] = await tx<Row[]>`
    insert into invitations (email, full_name, employee_id, role, token_hash, invited_by, expires_at)
    values (${email}, ${name}, ${employeeId}, 'super_admin', ${sha256(raw)}, null,
            now() + make_interval(hours => ${INVITE_TTL_HOURS}))
    returning expires_at`;
  await tx`insert into auth_audit (event, detail)
           values ('super_admin_invitation_issued', ${JSON.stringify({ email })}::jsonb)`;
  const link = inviteUrl(raw, base);
  console.info(`[auth] No Super Admin yet. Invitation for ${email}: ${link}`);
  if (!process.env["APP_URL"])
    console.warn("[auth] APP_URL is not set; the link above uses the request origin.");
  return invitationEmail({
    to: email,
    name,
    role: "super_admin",
    inviter: "The Anwar Organic administrator",
    link,
    expiresAt: new Date(row.expires_at),
  });
}
