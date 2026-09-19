// Booking links: when a batch is published, every employee gets a personal link that opens the
// platform already signed in, on the landing page, ready to book.
//
// The link signs someone in, so it is a credential and is treated as one: the token is random,
// stored only as a hash, tied to one employee, expires on its own, and every use is recorded.
import type { Sql, Tx } from "../db/client.server";
import { getDb } from "../db/client.server";
import { randomToken, sha256 } from "./crypto.server";
import { appUrl, startSession } from "./session.server";
import { escapeHtml, layout, button, sendMailDetailed, type MailMessage } from "./mail.server";

/** How long a link keeps working. */
export const BOOKING_LINK_TTL_DAYS = 14;

type Row = Record<string, string | number | boolean | Date | null>;

const dhaka = (value: Date | string) =>
  new Date(value).toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });

const dhakaDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium" });

/** How long is left to book, in plain words: "2 days and 3 hours", "45 minutes". */
export function timeToBook(cutoff: Date | string, now: Date = new Date()): string {
  const ms = new Date(cutoff).getTime() - now.getTime();
  if (ms <= 0) return "Bookings are closed";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0)
    return hours > 0 ? `${part(days, "day")} and ${part(hours, "hour")}` : part(days, "day");
  if (hours > 0)
    return mins > 0 ? `${part(hours, "hour")} and ${part(mins, "minute")}` : part(hours, "hour");
  return part(Math.max(1, mins), "minute");
}

interface BatchForMail {
  batch_no: string;
  rate_per_litre: string | number;
  saleable_litres: number;
  booking_cutoff: Date | string;
  delivery_date: Date | string;
  delivery_window: string;
  note: string | null;
}

function bookingEmail(input: {
  to: string;
  name: string;
  batch: BatchForMail;
  link: string;
  expiresAt: Date;
}): MailMessage {
  const { batch } = input;
  const rate = Number(batch.rate_per_litre);
  const left = timeToBook(batch.booking_cutoff);
  const row = (label: string, value: string) =>
    `<tr>
       <td style="padding:6px 16px 6px 0;color:#64748B;white-space:nowrap;">${escapeHtml(label)}</td>
       <td style="padding:6px 0;color:#0F172A;font-weight:600;">${escapeHtml(value)}</td>
     </tr>`;

  return {
    to: input.to,
    subject: `Today's milk is open for booking — ${batch.batch_no}`,
    template: "batch_published",
    html: layout(
      "Today's batch is open",
      `<p>Hello ${escapeHtml(input.name)},</p>
       <p>A new batch of fresh whole milk has been published. Book the litres you want before
       bookings close.</p>
       <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="margin:8px 0 4px;font-size:15px;">
         ${row("Batch", batch.batch_no)}
         ${row("Rate", `Tk ${rate}/litre`)}
         ${row("Available", `${batch.saleable_litres} litres`)}
         ${row("Time left to book", left)}
         ${row("Bookings close", `${dhaka(batch.booking_cutoff)} (Dhaka)`)}
         ${row("Collect on", `${dhakaDate(batch.delivery_date)}, ${batch.delivery_window}`)}
       </table>
       ${button(input.link, "Book my milk")}
       <p style="font-size:13px;color:#64748B;">This link is yours alone and signs you in, so
       please don't forward it. It stops working on ${escapeHtml(dhakaDate(input.expiresAt))}, and
       you can always sign in as usual instead.</p>
       ${batch.note ? `<p style="font-size:13px;color:#64748B;">${escapeHtml(batch.note)}</p>` : ""}`,
    ),
  };
}

/**
 * Issues a link for every employee who can book, and returns the emails to send.
 *
 * The mail is not sent here: this runs inside the transaction that publishes the batch, and a
 * mail server that is slow or down must not hold that transaction open or roll the publish back.
 */
export async function issueBookingLinks(tx: Tx, batchNo: string): Promise<MailMessage[]> {
  const [batch] = (await tx<Row[]>`
    select batch_no, rate_per_litre, saleable_litres, booking_cutoff, delivery_date,
           delivery_window, note
    from batches where batch_no = ${batchNo}`) as unknown as [BatchForMail | undefined];
  if (!batch) return [];

  // Everyone who holds the employee role on a live account, which is exactly who can book.
  const employees = await tx<Row[]>`
    select e.id, e.name, e.company_email
    from employees e
    join user_roles r on r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null
    where e.account_status = 'active' and e.deleted_at is null
    order by e.id`;

  const expiresAt = new Date(Date.now() + BOOKING_LINK_TTL_DAYS * 86_400_000);
  const mail: MailMessage[] = [];

  for (const employee of employees) {
    const token = randomToken(32);
    // One link per employee per batch: publishing again refreshes the same one rather than
    // leaving the previous link working alongside it.
    await tx`
      insert into booking_links (token_hash, employee_id, batch_no, expires_at)
      values (${sha256(token)}, ${employee["id"] as string}, ${batchNo}, ${expiresAt})
      on conflict (employee_id, batch_no) do update
        set token_hash = excluded.token_hash, expires_at = excluded.expires_at,
            created_at = now(), first_used_at = null, last_used_at = null,
            use_count = 0, last_used_ip = null, revoked_at = null`;
    mail.push(
      bookingEmail({
        to: employee["company_email"] as string,
        name: (employee["name"] as string) || "there",
        batch,
        link: `${appUrl()}/book?token=${token}`,
        expiresAt,
      }),
    );
  }
  return mail;
}

/**
 * Sends the batch emails one at a time, after the publish has committed.
 *
 * Sequential on purpose: a company mail server handles a steady queue better than a burst, and a
 * failure to one address must not stop the rest. Nothing is thrown -- the batch is already
 * published, and an undelivered email is not a reason to fail that.
 */
export async function sendBookingLinks(mail: MailMessage[]): Promise<void> {
  if (!mail.length) return;
  let sent = 0;
  let failed = 0;
  for (const message of mail) {
    try {
      const { delivery } = await sendMailDetailed(message);
      if (delivery === "failed") failed++;
      else sent++;
    } catch (error) {
      failed++;
      console.error(`[mail] booking link to ${message.to} failed`, error);
    }
  }
  console.info(`[mail] booking links: ${sent} sent, ${failed} failed, ${mail.length} total`);
}

export type BookingLinkResult =
  { ok: true; batchNo: string } | { ok: false; reason: "invalid" | "expired" };

/**
 * Opens a booking link: checks it, then signs that employee in.
 *
 * The link stays usable until it expires rather than dying on first open. Mail clients and
 * security scanners fetch links before a person ever sees them, and a single-use link is spent by
 * the time it is clicked; a link that works twice is worth more here than one that works once.
 */
export async function openBookingLink(token: string): Promise<BookingLinkResult> {
  if (!token || token.length < 20) return { ok: false, reason: "invalid" };
  const sql: Sql = await getDb();

  return (await sql.begin(async (tx) => {
    const [link] = await tx<Row[]>`
      select l.token_hash, l.batch_no, l.expires_at, l.revoked_at, e.id as employee_id
      from booking_links l
      join employees e on e.id = l.employee_id
      where l.token_hash = ${sha256(token)}
        and e.account_status = 'active' and e.deleted_at is null
        and exists (select 1 from user_roles r
                    where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)
      for update of l`;
    if (!link || link["revoked_at"]) return { ok: false, reason: "invalid" } as BookingLinkResult;
    if (new Date(link["expires_at"] as string).getTime() <= Date.now()) {
      return { ok: false, reason: "expired" } as BookingLinkResult;
    }

    await tx`
      update booking_links
      set use_count = use_count + 1, last_used_at = now(),
          first_used_at = coalesce(first_used_at, now())
      where token_hash = ${sha256(token)}`;

    // The same session an ordinary sign-in creates: employee portal, employee role.
    await startSession(tx, link["employee_id"] as string, "employee", "employee");
    return { ok: true, batchNo: link["batch_no"] as string } as BookingLinkResult;
  })) as BookingLinkResult;
}
