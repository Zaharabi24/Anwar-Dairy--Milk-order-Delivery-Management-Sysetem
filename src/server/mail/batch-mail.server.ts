// Sending one batch email.
//
// This is the only place a booking email is composed and sent, whichever engine is driving:
// the BullMQ worker when Redis is configured, or the in-process pacer when it isn't. Both call
// `sendQueuedEmail`, so retries, status and the rate limit behave identically either way.
import type { Sql } from "../db/client.server";
import { getDb } from "../db/client.server";
import { randomToken, sha256 } from "../auth/crypto.server";
import { appUrl } from "../auth/session.server";
import {
  escapeHtml,
  layout,
  button,
  sendMailDetailed,
  type MailMessage,
} from "../auth/mail.server";
import { MAIL_INTERVAL_MS, MAIL_RATE_PER_MINUTE, MAX_ATTEMPTS } from "./rate.server";

export { MAIL_INTERVAL_MS, MAIL_RATE_PER_MINUTE, MAX_ATTEMPTS };

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

export function bookingEmail(input: {
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
      `<p>Dear ${escapeHtml(input.name)},</p>
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
 * A refusal that will pass. The mailbox is over its rate, or the server is briefly unreachable --
 * the address is fine and the message should simply be tried again later.
 *
 * SMTP says this in the reply code: 4xx is "not now", 5xx is "no". Microsoft 365's throttle is
 * 421 4.4.2, and treating it as a permanent failure is what turned one refusal into hundreds --
 * every retry arrived just as fast as the burst that caused it.
 */
export function isTransientMailError(error: unknown): boolean {
  const text = String(
    (error as { response?: string })?.response ?? (error as Error)?.message ?? error,
  );
  if (/\b4\.4\.2\b|submission rate|exceeded the configured limit/i.test(text)) return true;
  if (/\b(421|450|451|452|454|471)\b/.test(text)) return true;
  if (/too many|rate limit|throttl|try again later|temporarily/i.test(text)) return true;
  if (/ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ESOCKET|EHOSTUNREACH/i.test(text)) return true;
  return false;
}

export type SendOutcome =
  /** Delivered, captured by a test inbox, or logged because no transport is configured. */
  | { result: "sent" }
  /** Nothing to do: already sent, or the row is gone. */
  | { result: "done" }
  /** Worth another go later. The caller decides whether any attempts are left. */
  | { result: "retry"; error: string }
  /** The address will never take it. */
  | { result: "failed"; error: string };

/**
 * Sends the booking email for one `batch_emails` row and records what happened.
 *
 * Claiming is done by the caller's engine, so this only ever does the work: mint the link, send,
 * write the outcome. It never throws -- an undelivered email is a status, not an exception.
 */
export async function sendQueuedEmail(emailId: string): Promise<SendOutcome> {
  const sql: Sql = await getDb();

  // The batch as it stands now, not as it stood when the publish began.
  //
  // For a first attempt those are the same thing. For a retry they need not be: an operator who
  // moved the cutoff or corrected the rate after publishing would otherwise have the retry go out
  // quoting figures they have already changed, and the link inside it would expire at the old
  // time. Nobody who is being retried has received anything yet, so there is no earlier version
  // to stay consistent with -- the message they finally get should be the true one. The
  // publication's own copy stays untouched as the record of what the send was told to say.
  const [row] = (await sql<Row[]>`
    select e.id, e.status, e.attempts, e.employee_id, e.employee_name, e.to_address,
           p.batch_no, p.collection_points,
           coalesce(b.booking_cutoff, p.booking_cutoff) as booking_cutoff,
           coalesce(b.delivery_date, p.delivery_date) as delivery_date,
           coalesce(b.delivery_window, p.delivery_window) as delivery_window,
           coalesce(b.rate_per_litre, p.rate_per_litre) as rate_per_litre,
           coalesce(b.saleable_litres, p.saleable_litres) as saleable_litres,
           b.note
    from batch_emails e
    join batch_publications p on p.id = e.publication_id
    left join batches b on b.batch_no = p.batch_no
    where e.id = ${emailId}`) as unknown as [Row | undefined];

  // Gone, already delivered, or has no address: nothing for this job to do. Checked here as well
  // as at claim time so a job replayed from Redis after a restart can't send a second copy.
  if (!row) return { result: "done" };
  const status = row["status"] as string;
  if (status === "sent" || status === "captured" || status === "logged" || status === "skipped") {
    return { result: "done" };
  }
  const address = ((row["to_address"] as string) ?? "").trim();
  if (!address) {
    await sql`update batch_emails set status = 'skipped', sent_at = now() where id = ${emailId}`;
    return { result: "done" };
  }

  const batch: BatchForMail = {
    batch_no: row["batch_no"] as string,
    rate_per_litre: row["rate_per_litre"] as string,
    saleable_litres: Number(row["saleable_litres"]),
    booking_cutoff: row["booking_cutoff"] as Date,
    delivery_date: row["delivery_date"] as Date,
    delivery_window: (row["delivery_window"] as string) ?? "",
    note: (row["note"] as string) ?? null,
  };
  const expiresAt = new Date(batch.booking_cutoff);

  try {
    // The token is minted now, not at publish: the plain token is never stored, so a message
    // being sent for the first time needs one issued for it. Re-issuing replaces any link this
    // person held for this batch, which is right -- an unsent row means they never got one.
    const token = randomToken(32);
    await sql`
      insert into booking_links (token_hash, employee_id, batch_no, expires_at)
      values (${sha256(token)}, ${row["employee_id"] as string}, ${batch.batch_no}, ${expiresAt})
      on conflict (employee_id, batch_no) do update
        set token_hash = excluded.token_hash, expires_at = excluded.expires_at,
            created_at = now(), first_used_at = null, last_used_at = null,
            use_count = 0, last_used_ip = null, revoked_at = null`;

    const { delivery, error } = await sendMailDetailed(
      bookingEmail({
        to: address,
        name: (row["employee_name"] as string) || "Colleague",
        batch,
        collectionPoint: (row["collection_points"] as string) || "To be confirmed",
        link: `${appUrl()}/book?token=${token}`,
      }),
    );

    if (delivery !== "failed") {
      await sql`
        update batch_emails set status = ${delivery}, error = null, sent_at = now()
        where id = ${emailId}`;
      return { result: "sent" };
    }
    return { result: "retry", error: error ?? "The mail server refused the message." };
  } catch (error) {
    const text = String(error).slice(0, 2000);
    return isTransientMailError(error)
      ? { result: "retry", error: text }
      : { result: "failed", error: text };
  }
}

/**
 * Writes the outcome of an attempt that didn't deliver.
 *
 * A message worth retrying goes back to 'queued' with the reason recorded, so Email Records shows
 * why it hasn't arrived yet without claiming it has failed. It only becomes 'failed' once there
 * are no attempts left, which is the point at which somebody has to do something about it.
 */
export async function recordAttempt(
  emailId: string,
  outcome: { result: "retry" | "failed"; error: string },
  attemptsLeft: boolean,
  attemptsMade?: number,
): Promise<void> {
  const sql: Sql = await getDb();
  const retrying = outcome.result === "retry" && attemptsLeft;
  // The count is the engine's, not the row's: BullMQ keeps it in Redis, and the in-process pacer
  // keeps it here. Writing it back either way is what lets Email Records say "tried three times"
  // rather than leaving a reader to guess whether anything is still happening.
  await sql`
    update batch_emails
    set status = ${retrying ? "queued" : "failed"},
        error = ${outcome.error.slice(0, 2000)},
        attempts = greatest(attempts, coalesce(${attemptsMade ?? null}::int, attempts)),
        claimed_at = null,
        sent_at = ${retrying ? null : new Date()}
    where id = ${emailId}`;
}

/**
 * Rolls the per-message outcomes up onto the publication. Stays 'sending' while any are left.
 *
 * Superseded rows are left out. A failure that has been resent is a record of what happened, not
 * a thing still outstanding -- counted here it would hold the publication at 'partial' for good,
 * however well the retry went, and a publication that ended up reaching everybody would be
 * reported as one that hadn't.
 */
export async function updatePublicationTotals(publicationId: string): Promise<number> {
  const sql: Sql = await getDb();
  const [pending] = (await sql<Row[]>`
    select count(*)::int as n from batch_emails
    where publication_id = ${publicationId}
      and attempts < ${MAX_ATTEMPTS}
      and status in ('queued', 'sending')`) as unknown as [{ n: number }];

  await sql`
    update batch_publications p set
      sent_count = t.delivered,
      failed_count = t.failed,
      status = case
                 when t.total = 0 then 'no_recipients'
                 when ${pending.n} > 0 then 'sending'
                 when t.delivered = 0 then 'failed'
                 when t.failed > 0 or t.skipped > 0 then 'partial'
                 else 'sent'
               end,
      completed_at = case when ${pending.n} > 0 then null else now() end
    from (
      select count(*) as total,
             count(*) filter (where status in ('sent', 'captured', 'logged')) as delivered,
             count(*) filter (where status = 'failed') as failed,
             count(*) filter (where status = 'skipped') as skipped
      from batch_emails
      where publication_id = ${publicationId} and resent_as is null
    ) t
    where p.id = ${publicationId}`;
  return pending.n;
}
