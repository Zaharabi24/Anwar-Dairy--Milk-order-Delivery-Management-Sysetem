// Booking links: when a batch is published, everyone active in the Employee Database gets a
// personal link that opens the platform ready to book, with no sign-in step.
//
// The link is the whole authorisation, so it is treated as a credential: the token is random,
// stored only as a hash, tied to one person and one batch, and it stops working the moment
// bookings close -- the batch's own cutoff is the expiry, not a fixed number of days.
//
// Every publish also writes its own record: one batch_publications row for the send, and one
// batch_emails row per person, carrying their directory details as they stood that day.
import type { Sql, Tx } from "../db/client.server";
import { getDb } from "../db/client.server";
import { randomToken, sha256 } from "./crypto.server";
import { appUrl, clientIp, startSession } from "./session.server";
import { escapeHtml, layout, button, sendMailDetailed, type MailMessage } from "./mail.server";

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
  collectionPoint: string;
  link: string;
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
         ${row("Collection point", input.collectionPoint)}
       </table>
       ${button(input.link, "Book Milk")}
       <p style="font-size:13px;color:#64748B;">This link is yours alone and books in your name,
       so please don't forward it. It stops working when bookings close at
       ${escapeHtml(dhaka(batch.booking_cutoff))} (Dhaka).</p>
       ${batch.note ? `<p style="font-size:13px;color:#64748B;">${escapeHtml(batch.note)}</p>` : ""}`,
    ),
  };
}

/** One queued message and the batch_emails row it has to report back to. */
export interface QueuedBookingMail {
  emailId: string;
  message: MailMessage;
}

export interface PublishMailJob {
  publicationId: string;
  queued: QueuedBookingMail[];
}

/**
 * Records the publish, issues a link for everyone active in the Employee Database, and returns
 * the mail to send.
 *
 * The mail is not sent here: this runs inside the transaction that publishes the batch, and a
 * mail server that is slow or down must not hold that transaction open or roll the publish back.
 */
export async function issueBookingLinks(
  tx: Tx,
  batchNo: string,
  publishedBy: { name: string; employeeId: string },
): Promise<PublishMailJob | null> {
  const [batch] = (await tx<Row[]>`
    select batch_no, rate_per_litre, saleable_litres, booking_cutoff, delivery_date,
           delivery_window, note
    from batches where batch_no = ${batchNo}`) as unknown as [BatchForMail | undefined];
  if (!batch) return null;

  // Where the milk is collected, as named on the batch. Listed in the email so nobody has to open
  // the app to find out where to go.
  const points = await tx<Row[]>`
    select p.name
    from batch_delivery_points bdp
    join delivery_points p on p.id = bdp.delivery_point_id
    where bdp.batch_no = ${batchNo}
    order by bdp.position, p.name`;
  const collectionPoint = points.map((p) => p["name"] as string).join(", ") || "To be confirmed";

  // The Employee Database is the mailing list. Active only -- switching someone off is exactly
  // how a System Admin stops the batch mail reaching them -- and never anyone deleted.
  //
  // The employee role is what everyone in the directory is given (migration 0009, and every
  // manual add since), and it is what the link needs to open a booking session. Requiring it here
  // keeps the mail and the link in step: nobody is sent a link that would fail to open, which is
  // what a staff-only account -- an operator or a coordinator, in the directory but not bookable
  // -- would otherwise receive.
  const employees = await tx<Row[]>`
    select e.id, e.name, e.company_email, e.department, e.designation, e.phone, e.site
    from employees e
    where e.active and e.deleted_at is null
      and exists (select 1 from user_roles r
                  where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)
    order by e.name, e.id`;

  // Booking close time is the link's expiry. They are the same instant by definition: the link
  // exists to place an order, and after the cutoff there is no order to place.
  const expiresAt = new Date(batch.booking_cutoff);

  const [publication] = (await tx<Row[]>`
    insert into batch_publications
      (batch_no, published_by, published_by_id, booking_cutoff, delivery_date, delivery_window,
       rate_per_litre, saleable_litres, collection_points, recipients)
    values (${batchNo}, ${publishedBy.name}, ${publishedBy.employeeId}, ${batch.booking_cutoff},
            ${batch.delivery_date}, ${batch.delivery_window}, ${Number(batch.rate_per_litre)},
            ${batch.saleable_litres}, ${collectionPoint}, ${employees.length})
    returning id`) as unknown as [{ id: string }];

  const queued: QueuedBookingMail[] = [];

  for (const employee of employees) {
    const address = ((employee["company_email"] as string) ?? "").trim();
    const name = (employee["name"] as string) || "there";

    // The directory details are copied onto the record, not joined to it: this is what was sent
    // on the day, and someone changing department later must not rewrite that.
    const record = {
      publication_id: publication.id,
      batch_no: batchNo,
      employee_id: employee["id"] as string,
      employee_name: name,
      employee_ref: employee["id"] as string,
      to_address: address,
      department: (employee["department"] as string) ?? "",
      designation: (employee["designation"] as string) ?? "",
      phone: (employee["phone"] as string) ?? "",
      location: (employee["site"] as string) ?? "",
      link_expires_at: expiresAt,
    };

    // Somebody active but with no address on file. They stay on the record, marked skipped, so
    // the reason they heard nothing is on the page rather than left to be guessed at.
    if (!address) {
      await tx`insert into batch_emails ${tx({ ...record, status: "skipped" })}`;
      continue;
    }

    const token = randomToken(32);
    // One link per person per batch: publishing again refreshes the same one rather than leaving
    // the previous link working alongside it.
    await tx`
      insert into booking_links (token_hash, employee_id, batch_no, expires_at)
      values (${sha256(token)}, ${employee["id"] as string}, ${batchNo}, ${expiresAt})
      on conflict (employee_id, batch_no) do update
        set token_hash = excluded.token_hash, expires_at = excluded.expires_at,
            created_at = now(), first_used_at = null, last_used_at = null,
            use_count = 0, last_used_ip = null, revoked_at = null`;

    const [emailRow] = (await tx<Row[]>`
      insert into batch_emails ${tx(record)} returning id`) as unknown as [{ id: string }];

    queued.push({
      emailId: emailRow.id,
      message: bookingEmail({
        to: address,
        name,
        batch,
        collectionPoint,
        link: `${appUrl()}/book?token=${token}`,
      }),
    });
  }

  return { publicationId: publication.id, queued };
}

/**
 * Sends the batch emails one at a time, after the publish has committed, and marks each one off.
 *
 * Sequential on purpose: a company mail server handles a steady queue better than a burst, and a
 * failure to one address must not stop the rest. Nothing is thrown -- the batch is already
 * published, and an undelivered email is not a reason to fail that.
 */
export async function sendBookingLinks(job: PublishMailJob): Promise<void> {
  const sql: Sql = await getDb();

  for (const { emailId, message } of job.queued) {
    try {
      const { delivery, error } = await sendMailDetailed(message);
      await sql`
        update batch_emails set status = ${delivery}, error = ${error ?? null}, sent_at = now()
        where id = ${emailId}`;
    } catch (error) {
      console.error(`[mail] booking link to ${message.to} failed`, error);
      await sql`
        update batch_emails
        set status = 'failed', error = ${String(error).slice(0, 2000)}, sent_at = now()
        where id = ${emailId}`;
    }
  }

  await finishPublication(sql, job.publicationId);
}

/** Totals the send once the last message has been attempted, and closes the publication record. */
async function finishPublication(sql: Sql, publicationId: string): Promise<void> {
  const [totals] = (await sql<Row[]>`
    update batch_publications p set
      sent_count = t.delivered,
      failed_count = t.failed,
      status = case
                 when t.total = 0 then 'no_recipients'
                 when t.delivered = 0 then 'failed'
                 when t.failed > 0 or t.skipped > 0 then 'partial'
                 else 'sent'
               end,
      completed_at = now()
    from (
      select count(*) as total,
             count(*) filter (where status in ('sent', 'captured', 'logged')) as delivered,
             count(*) filter (where status = 'failed') as failed,
             count(*) filter (where status = 'skipped') as skipped
      from batch_emails where publication_id = ${publicationId}
    ) t
    where p.id = ${publicationId}
    returning p.sent_count, p.failed_count, p.recipients`) as unknown as [Row | undefined];

  if (totals) {
    console.info(
      `[mail] booking links: ${totals["sent_count"]} sent, ${totals["failed_count"]} failed, ` +
        `${totals["recipients"]} in the directory`,
    );
  }
}

export type BookingLinkResult =
  { ok: true; batchNo: string } | { ok: false; reason: "invalid" | "expired" };

/**
 * Opens a booking link: checks it, then opens a booking session for that person.
 *
 * The link stays usable until it expires rather than dying on first open. Mail clients and
 * security scanners fetch links before a person ever sees them, and a single-use link is spent by
 * the time it is clicked; a link that works twice is worth more here than one that works once.
 *
 * The session it opens is cut to the same instant the link expires, so closing the booking closes
 * the door behind it -- someone mid-page when the cutoff passes is not left holding an open
 * session against a batch that no longer takes orders.
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
        and e.active and e.deleted_at is null
        and exists (select 1 from user_roles r
                    where r.employee_id = e.id and r.role = 'employee' and r.revoked_at is null)
      for update of l`;
    if (!link || link["revoked_at"]) return { ok: false, reason: "invalid" } as BookingLinkResult;

    const expiresAt = new Date(link["expires_at"] as string);
    if (expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" } as BookingLinkResult;
    }

    await tx`
      update booking_links
      set use_count = use_count + 1, last_used_at = now(),
          first_used_at = coalesce(first_used_at, now()), last_used_ip = ${clientIp()}
      where token_hash = ${sha256(token)}`;

    await startSession(tx, link["employee_id"] as string, "employee", "employee", {
      origin: "booking_link",
      expiresAt,
    });
    return { ok: true, batchNo: link["batch_no"] as string } as BookingLinkResult;
  })) as BookingLinkResult;
}
