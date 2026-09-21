// Publish Records and Email Records: the history of every batch that was published and every
// message that went out with it.
//
// These are read-only views over rows written by the publish itself (booking-links.server.ts).
// Nothing here recomputes what was sent -- the point of a record is that it says what happened,
// not what would happen if it ran again today.
import { getDb } from "./db/client.server";
import { requirePermission } from "./auth/session.server";
import {
  enqueuePublication,
  isQueueEnabled,
  resumePendingPublications,
} from "./mail/mail-queue.server";
import type { EmailRecordQuery } from "@/lib/records.schemas";
import type { EmailRecordPage, EmailRecordRow, PublishRecord } from "@/lib/records-types";

type Row = Record<string, string | number | boolean | Date | null>;

const iso = (value: unknown): string | null =>
  value ? new Date(value as string).toISOString() : null;

/**
 * Every publish, newest first, with how the send went and how much was booked afterwards.
 *
 * Orders are counted against the batch rather than the publish: a batch paused and reopened has
 * two publications but one set of orders, and splitting them between the two would invent a
 * distinction the orders themselves don't carry.
 */
export async function listPublishRecords(): Promise<PublishRecord[]> {
  await requirePermission("batches.manage");

  // Opening this page puts back anything a restart left behind. With Redis the jobs are already
  // there and this costs one query; without it, this is what restarts the in-process sender.
  // Either way it returns at once -- it hands work over, it does not wait for the mail to go.
  await resumePendingPublications().catch((error: unknown) =>
    console.error("[mail] resuming pending publications failed", error),
  );

  const sql = await getDb();

  const rows = await sql<Row[]>`
    select p.id, p.batch_no, p.published_at, p.published_by, p.booking_cutoff, p.delivery_date,
           p.delivery_window, p.rate_per_litre, p.saleable_litres, p.collection_points,
           p.recipients, p.sent_count, p.failed_count, p.status, p.completed_at,
           b.status as batch_status, b.product,
           (select count(*) from batch_emails e
             where e.publication_id = p.id and e.status = 'skipped') as skipped_count,
           (select count(*) from batch_emails e
             where e.publication_id = p.id and e.attempts < 5
               and e.status in ('queued', 'sending')) as pending_count,
           (select coalesce(sum(o.litres), 0) from orders o
             where o.batch_no = p.batch_no and o.status <> 'Cancelled') as booked_litres,
           (select count(*) from orders o
             where o.batch_no = p.batch_no and o.status <> 'Cancelled') as order_count
    from batch_publications p
    join batches b on b.batch_no = p.batch_no
    order by p.published_at desc, p.id desc
    limit 500`;

  return rows.map((r) => ({
    id: String(r["id"]),
    batchNo: r["batch_no"] as string,
    pendingCount: Number(r["pending_count"]),
    product: (r["product"] as string) ?? "",
    batchStatus: (r["batch_status"] as string) ?? "",
    publishedAt: iso(r["published_at"])!,
    publishedBy: (r["published_by"] as string) || "—",
    bookingCutoff: iso(r["booking_cutoff"])!,
    deliveryDate: iso(r["delivery_date"])!,
    deliveryWindow: (r["delivery_window"] as string) ?? "",
    ratePerLitre: Number(r["rate_per_litre"]),
    saleableLitres: Number(r["saleable_litres"]),
    collectionPoints: (r["collection_points"] as string) ?? "",
    recipients: Number(r["recipients"]),
    sentCount: Number(r["sent_count"]),
    failedCount: Number(r["failed_count"]),
    skippedCount: Number(r["skipped_count"]),
    status: r["status"] as PublishRecord["status"],
    completedAt: iso(r["completed_at"]),
    bookedLitres: Number(r["booked_litres"]),
    orderCount: Number(r["order_count"]),
  }));
}

/**
 * The emails sent on a given day, or for a given batch, with the directory details each one
 * carried and whether the person went on to order.
 *
 * Dates are compared in Dhaka time, because "which emails went out on the 19th" means the 19th
 * where the office is, not wherever the server happens to think midnight falls.
 */
export async function listEmailRecords(query: EmailRecordQuery): Promise<EmailRecordPage> {
  await requirePermission("email_records.view");

  // Same as Publish Records: looking at the records is a good moment to make sure the rest is
  // on its way.
  await resumePendingPublications().catch((error: unknown) =>
    console.error("[mail] resuming pending publications failed", error),
  );

  const sql = await getDb();

  const search = query.search.trim().toLowerCase();
  const like = search ? `%${search}%` : null;
  const limit = Math.min(Math.max(query.limit, 1), 500);

  const where = sql`
    where (${query.from}::date is null
           or (e.created_at at time zone 'Asia/Dhaka')::date >= ${query.from}::date)
      and (${query.to}::date is null
           or (e.created_at at time zone 'Asia/Dhaka')::date <= ${query.to}::date)
      and (${query.batchNo}::text is null or e.batch_no = ${query.batchNo})
      and (${query.status}::text is null or e.status = ${query.status})
      and (${like}::text is null
           or lower(e.employee_name) like ${like}
           or lower(e.employee_ref) like ${like}
           or lower(e.to_address) like ${like}
           or lower(e.department) like ${like}
           or lower(e.designation) like ${like})`;

  const [rows, [totals]] = await Promise.all([
    sql<Row[]>`
      select e.id, e.publication_id, e.batch_no, e.employee_id, e.employee_name, e.employee_ref,
             e.to_address, e.department, e.designation, e.phone, e.location, e.status, e.error,
             e.link_expires_at, e.created_at, e.sent_at,
             p.published_at, p.collection_points,
             exists (select 1 from orders o
                     where o.batch_no = e.batch_no and o.employee_id = e.employee_id
                       and o.status <> 'Cancelled') as ordered
      from batch_emails e
      join batch_publications p on p.id = e.publication_id
      ${where}
      order by e.created_at desc, e.employee_name
      limit ${limit} offset ${query.offset}`,
    // Counted over everything the filters match, not over the page on screen. A card headed
    // "Total Sent" that only totals the hundred rows you happen to be looking at answers a
    // question nobody asked.
    sql<Row[]>`
      select count(*) as total,
             count(*) filter (where e.status in ('sent', 'captured', 'logged')) as sent,
             count(*) filter (where e.status = 'failed') as failed,
             count(*) filter (where exists (
               select 1 from orders o
               where o.batch_no = e.batch_no and o.employee_id = e.employee_id
                 and o.status <> 'Cancelled')) as booked
      from batch_emails e ${where}`,
  ]);

  const records: EmailRecordRow[] = rows.map((r) => ({
    id: String(r["id"]),
    batchNo: r["batch_no"] as string,
    employeeId: (r["employee_id"] as string) ?? null,
    employeeName: (r["employee_name"] as string) ?? "",
    employeeRef: (r["employee_ref"] as string) ?? "",
    toAddress: (r["to_address"] as string) ?? "",
    department: (r["department"] as string) ?? "",
    designation: (r["designation"] as string) ?? "",
    phone: (r["phone"] as string) ?? "",
    location: (r["location"] as string) ?? "",
    status: r["status"] as EmailRecordRow["status"],
    error: (r["error"] as string) ?? null,
    collectionPoints: (r["collection_points"] as string) ?? "",
    linkExpiresAt: iso(r["link_expires_at"]),
    createdAt: iso(r["created_at"])!,
    sentAt: iso(r["sent_at"]),
    ordered: Boolean(r["ordered"]),
  }));

  return {
    records,
    total: Number(totals?.["total"] ?? 0),
    sent: Number(totals?.["sent"] ?? 0),
    failed: Number(totals?.["failed"] ?? 0),
    booked: Number(totals?.["booked"] ?? 0),
  };
}

/** The batches that have ever been published, for the Email Records batch filter. */
export async function listPublishedBatchNumbers(): Promise<string[]> {
  await requirePermission("email_records.view");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select distinct batch_no, max(published_at) as last_published
    from batch_publications group by batch_no
    order by max(published_at) desc limit 200`;
  return rows.map((r) => r["batch_no"] as string);
}

/**
 * Puts a publication's outstanding mail back on the queue, for the operator who wants to be sure
 * it is moving rather than wait for the next page load to do it.
 *
 * It does not wait for the sending. The rate is the provider's, not ours: a full directory is
 * around a quarter of an hour whoever asks for it, and the page shows how far it has got.
 */
export async function resumePublicationMail(input: { publicationId: string }) {
  await requirePermission("batches.manage");
  const queued = await enqueuePublication(input.publicationId);
  return { queued, durable: isQueueEnabled() };
}
