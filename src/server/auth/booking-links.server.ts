// Booking links: when a batch is published, everyone active in the Employee Database gets a
// personal link that opens the platform ready to book, with no sign-in step.
//
// The link is the whole authorisation, so it is treated as a credential: the token is random,
// stored only as a hash, tied to one person and one batch, and it stops working the moment
// bookings close -- the batch's own cutoff is the expiry, not a fixed number of days.
//
// Publishing writes the record and the queue, and sends nothing. Sending is a paced, retrying
// job (src/server/mail/) that Microsoft 365 will only take 30 messages a minute of, so it is a
// quarter of an hour of work for a full directory. Tying that to the request that published is
// what loses mail.
import type { Sql, Tx } from "../db/client.server";
import { getDb } from "../db/client.server";
import { sha256 } from "./crypto.server";
import { clientIp, startSession } from "./session.server";
import { MAX_ATTEMPTS } from "../mail/rate.server";

type Row = Record<string, string | number | boolean | Date | null>;

interface BatchForMail {
  batch_no: string;
  booking_cutoff: Date | string;
  delivery_date: Date | string;
  delivery_window: string;
  rate_per_litre: string | number;
  saleable_litres: number;
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
