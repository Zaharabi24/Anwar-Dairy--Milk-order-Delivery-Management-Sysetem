// Booking links: when a batch is published, everyone active in the Employee Database gets a
// personal link that opens the platform ready to book, with no sign-in step.
//
// The link is the whole authorisation, so it is treated as a credential: the token is random,
// stored only as a hash, tied to one person and one batch, and it stops working the moment
// bookings close -- the batch's own cutoff is the expiry, not a fixed number of days.
//
// Publishing writes the record and the queue, and sends nothing. Sending is a separate, resumable
// pass over that queue (`drainPublicationMail`). Those are deliberately two things: the publish is
// one database transaction that either happened or didn't, while the send is 360 conversations
// with a mail server that takes minutes and can be interrupted at any point. Tying the second to
// the request that did the first is what loses mail.
import type { Sql, Tx } from "../db/client.server";
import { getDb } from "../db/client.server";
import { randomToken, sha256 } from "./crypto.server";
import { appUrl, clientIp, startSession } from "./session.server";
import { escapeHtml, layout, button, sendMailDetailed, type MailMessage } from "./mail.server";

type Row = Record<string, string | number | boolean | Date | null>;

/** Messages taken from the queue per pass. Small enough that an interruption loses little. */
const CLAIM_SIZE = 25;

/** How many at a time are in flight. A company mail server prefers a steady trickle to a burst. */
const CONCURRENCY = 4;

/** A claim older than this was interrupted, and the message is free to be picked up again. */
const CLAIM_TIMEOUT_MINUTES = 10;

/** Attempts before an address is left alone. Covers a mail server that is briefly unreachable. */
const MAX_ATTEMPTS = 3;

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

/**
 * Records the publish and queues a message for everyone active in the Employee Database.
 *
 * No mail is sent and no token is minted here. This runs inside the transaction that publishes
 * the batch, so it has to be quick and it must not be able to fail for a reason that has nothing
 * to do with publishing. What it leaves behind is a queue: one row per person, ready to be sent.
 */
export async function recordPublication(
  tx: Tx,
  batchNo: string,
  publishedBy: { name: string; employeeId: string },
): Promise<string | null> {
  const [batch] = (await tx<Row[]>`
    select batch_no, booking_cutoff, delivery_date, delivery_window, rate_per_litre,
           saleable_litres
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

  if (!employees.length) {
    await tx`
      update batch_publications set status = 'no_recipients', completed_at = now()
      where id = ${publication.id}`;
    return publication.id;
  }

  // The directory details are copied onto the record, not joined to it: this is what was sent on
  // the day, and someone changing department later must not rewrite that. Someone active with no
  // address on file is 'skipped' rather than left out, so the reason they heard nothing is on the
  // page rather than left to be guessed at.
  await tx`insert into batch_emails ${tx(
    employees.map((employee) => {
      const address = ((employee["company_email"] as string) ?? "").trim();
      return {
        publication_id: publication.id,
        batch_no: batchNo,
        employee_id: employee["id"] as string,
        employee_name: (employee["name"] as string) || "there",
        employee_ref: employee["id"] as string,
        to_address: address,
        department: (employee["department"] as string) ?? "",
        designation: (employee["designation"] as string) ?? "",
        phone: (employee["phone"] as string) ?? "",
        location: (employee["site"] as string) ?? "",
        link_expires_at: expiresAt,
        status: address ? "queued" : "skipped",
      };
    }),
  )}`;

  return publication.id;
}

export interface DrainResult {
  sent: number;
  failed: number;
  /** Still waiting after this pass, so the caller knows whether to come back. */
  remaining: number;
}

/**
 * Sends whatever is still waiting for one publication, and can be called again to finish.
 *
 * Each pass claims a small batch of rows, sends them, and writes the outcome back. A claim marks
 * a row 'sending' so two passes running at once never mail the same person twice; a claim left
 * behind by an interrupted pass is reclaimed after `CLAIM_TIMEOUT_MINUTES` and tried again.
 *
 * Nothing is thrown. The batch is published either way, and an undelivered email is not a reason
 * to fail anything -- it is a reason to still be in the queue.
 */
export async function drainPublicationMail(
  publicationId: string,
  options: { maxMessages?: number; timeBudgetMs?: number } = {},
): Promise<DrainResult> {
  const sql: Sql = await getDb();
  const budget = options.maxMessages ?? Number.POSITIVE_INFINITY;
  // A page that resumes the queue must not wait on the mail server to finish it. How long a
  // message takes is the mail server's business -- it can be milliseconds to a local catcher or a
  // second to a throttled relay -- so the stopping point is a clock, not a count. Whatever is left
  // when time is up is still queued, and the next pass takes it.
  const deadline =
    options.timeBudgetMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + options.timeBudgetMs;
  let sent = 0;
  let failed = 0;
  let handled = 0;

  const [context] = (await sql<Row[]>`
    select p.batch_no, p.collection_points, p.booking_cutoff, p.delivery_date, p.delivery_window,
           p.rate_per_litre, p.saleable_litres, b.note
    from batch_publications p
    join batches b on b.batch_no = p.batch_no
    where p.id = ${publicationId}`) as unknown as [Row | undefined];
  if (!context) return { sent: 0, failed: 0, remaining: 0 };

  const batch: BatchForMail = {
    batch_no: context["batch_no"] as string,
    rate_per_litre: context["rate_per_litre"] as string,
    saleable_litres: Number(context["saleable_litres"]),
    booking_cutoff: context["booking_cutoff"] as Date,
    delivery_date: context["delivery_date"] as Date,
    delivery_window: (context["delivery_window"] as string) ?? "",
    note: (context["note"] as string) ?? null,
  };
  const collectionPoint = (context["collection_points"] as string) ?? "To be confirmed";
  const expiresAt = new Date(batch.booking_cutoff);

  for (;;) {
    if (handled >= budget || Date.now() >= deadline) break;
    const take = Math.min(CLAIM_SIZE, budget - handled);

    // Claim in one statement so two passes can't take the same row. `skip locked` lets a second
    // pass work on the rest instead of waiting behind the first.
    const claimed = await sql<Row[]>`
      update batch_emails set status = 'sending', claimed_at = now(), attempts = attempts + 1
      where id in (
        select id from batch_emails
        where publication_id = ${publicationId}
          and attempts < ${MAX_ATTEMPTS}
          and (status = 'queued'
               or status = 'failed'
               or (status = 'sending'
                   and claimed_at < now() - make_interval(mins => ${CLAIM_TIMEOUT_MINUTES})))
        order by id
        limit ${take}
        for update skip locked
      )
      returning id, employee_id, employee_name, to_address`;
    if (!claimed.length) break;
    handled += claimed.length;

    // A few at a time rather than one after another: 360 sequential round trips is minutes of
    // waiting, and minutes is what gets a background send cut off.
    for (let i = 0; i < claimed.length; i += CONCURRENCY) {
      // Time can run out mid-chunk. Anything already claimed but not reached goes back to the
      // queue rather than sitting as a claim nobody is honouring.
      if (Date.now() >= deadline) {
        const unsent = claimed.slice(i).map((row) => row["id"] as string);
        await sql`
          update batch_emails set status = 'queued', claimed_at = null, attempts = attempts - 1
          where id = any(${unsent}::bigint[]) and status = 'sending'`;
        break;
      }
      const slice = claimed.slice(i, i + CONCURRENCY);
      const outcomes = await Promise.all(
        slice.map(async (row) => {
          const emailId = row["id"] as string;
          try {
            // The token is minted now, not at publish: the plain token is never stored, so a
            // message that is being sent for the first time needs one issued for it. Re-issuing
            // replaces any link this person held for this batch, which is right -- a queued or
            // failed row means they were never successfully sent the previous one.
            const token = randomToken(32);
            await sql`
              insert into booking_links (token_hash, employee_id, batch_no, expires_at)
              values (${sha256(token)}, ${row["employee_id"] as string}, ${batch.batch_no},
                      ${expiresAt})
              on conflict (employee_id, batch_no) do update
                set token_hash = excluded.token_hash, expires_at = excluded.expires_at,
                    created_at = now(), first_used_at = null, last_used_at = null,
                    use_count = 0, last_used_ip = null, revoked_at = null`;

            const { delivery, error } = await sendMailDetailed(
              bookingEmail({
                to: row["to_address"] as string,
                name: (row["employee_name"] as string) || "there",
                batch,
                collectionPoint,
                link: `${appUrl()}/book?token=${token}`,
              }),
            );
            await sql`
              update batch_emails
              set status = ${delivery}, error = ${error ?? null}, sent_at = now()
              where id = ${emailId}`;
            return delivery === "failed" ? "failed" : "sent";
          } catch (error) {
            console.error(`[mail] booking link to ${row["to_address"] as string} failed`, error);
            await sql`
              update batch_emails
              set status = 'failed', error = ${String(error).slice(0, 2000)}, sent_at = now()
              where id = ${emailId}`;
            return "failed";
          }
        }),
      );
      for (const outcome of outcomes) {
        if (outcome === "sent") sent++;
        else failed++;
      }
    }
  }

  const remaining = await countPending(sql, publicationId);
  await updatePublicationTotals(sql, publicationId, remaining);
  if (sent || failed) {
    console.info(
      `[mail] publication ${publicationId}: ${sent} sent, ${failed} failed, ${remaining} waiting`,
    );
  }
  return { sent, failed, remaining };
}

/** How many messages this publication still has to send, including ones worth retrying. */
async function countPending(sql: Sql, publicationId: string): Promise<number> {
  const [row] = (await sql<Row[]>`
    select count(*)::int as n from batch_emails
    where publication_id = ${publicationId}
      and attempts < ${MAX_ATTEMPTS}
      and status in ('queued', 'sending', 'failed')`) as unknown as [{ n: number }];
  return row.n;
}

/** Rolls the per-message outcomes up onto the publication. Stays 'sending' while any are left. */
async function updatePublicationTotals(
  sql: Sql,
  publicationId: string,
  remaining: number,
): Promise<void> {
  await sql`
    update batch_publications p set
      sent_count = t.delivered,
      failed_count = t.failed,
      status = case
                 when t.total = 0 then 'no_recipients'
                 when ${remaining} > 0 then 'sending'
                 when t.delivered = 0 then 'failed'
                 when t.failed > 0 or t.skipped > 0 then 'partial'
                 else 'sent'
               end,
      completed_at = case when ${remaining} > 0 then null else now() end
    from (
      select count(*) as total,
             count(*) filter (where status in ('sent', 'captured', 'logged')) as delivered,
             count(*) filter (where status = 'failed') as failed,
             count(*) filter (where status = 'skipped') as skipped
      from batch_emails where publication_id = ${publicationId}
    ) t
    where p.id = ${publicationId}`;
}

/**
 * Finishes any publication that still has mail waiting.
 *
 * This is what makes an interrupted send heal itself: the Publish Records and Email Records
 * screens call it when they load, so anything a restart or a frozen runtime cut short is picked
 * up the next time somebody looks -- without a scheduler, a queue service or a cron entry to
 * install and keep running.
 */
export async function resumePendingPublications(
  options: { maxMessages?: number; timeBudgetMs?: number } = {},
): Promise<DrainResult> {
  const sql: Sql = await getDb();
  const pending = await sql<Row[]>`
    select distinct p.id
    from batch_publications p
    join batch_emails e on e.publication_id = p.id
    where p.status = 'sending'
      and e.attempts < ${MAX_ATTEMPTS}
      and e.status in ('queued', 'sending', 'failed')
    order by p.id desc
    limit 5`;

  const total: DrainResult = { sent: 0, failed: 0, remaining: 0 };
  let budget = options.maxMessages ?? Number.POSITIVE_INFINITY;
  const deadline =
    options.timeBudgetMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + options.timeBudgetMs;
  for (const row of pending) {
    if (budget <= 0 || Date.now() >= deadline) break;
    const result = await drainPublicationMail(row["id"] as string, {
      maxMessages: budget,
      ...(deadline === Number.POSITIVE_INFINITY
        ? {}
        : { timeBudgetMs: Math.max(0, deadline - Date.now()) }),
    });
    total.sent += result.sent;
    total.failed += result.failed;
    total.remaining += result.remaining;
    budget -= result.sent + result.failed;
  }
  return total;
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
