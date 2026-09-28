// Composing and sending one mailbox message.
//
// The System Admin writes a subject and a body; this renders that into the same branded layout
// every other email from the platform uses, and sends one copy per recipient through the same
// paced queue as the batch mail.
import type { Sql } from "../db/client.server";
import { getDb } from "../db/client.server";
import {
  escapeHtml,
  layout,
  sendMailDetailed,
  type MailAttachment,
  type MailMessage,
} from "../auth/mail.server";
import { isRateLimited } from "./rate.server";
import { renderMailHtml } from "./rich-text.server";

/** How a message was written: plain text with `**bold**`, or the formatting editor. */
export type BodyFormat = "text" | "html";

type Row = Record<string, string | number | boolean | Date | null>;

/**
 * Turns what the System Admin typed into the body of an official email.
 *
 * The message is plain text, and it is escaped before anything else happens. That is not a guard
 * against the System Admin -- it is a guard against what an email containing raw HTML does: mail
 * clients render a fraction of it, the rest arrives as visible tag soup, and a message that can
 * carry arbitrary markup over the company's own branding is a phishing template waiting to be
 * borrowed. Blank lines separate paragraphs and single line breaks are kept, which is what
 * somebody typing into a box expects to happen.
 *
 * Bold is the one exception, written as **like this**. It is applied after escaping, never
 * before: the <strong> that comes out is one this function wrote, so allowing emphasis does
 * not reopen the door to markup the composer typed. Anything else with asterisks around it --
 * a single pair, an unclosed one, a footnote marker -- is left exactly as it was typed.
 */
export function renderCampaignBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;">${bold(escapeHtml(paragraph)).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");
}

/**
 * `**text**` becomes bold. Non-greedy, so two bold runs on one line stay two runs rather than
 * swallowing what sits between them, and the contents may not start with another asterisk --
 * `****` is four asterisks somebody typed, not emphasis around nothing.
 */
function bold(escaped: string): string {
  return escaped.replace(/\*\*([^*][\s\S]*?)\*\*/g, "<strong>$1</strong>");
}

/** The finished email, exactly as a recipient receives it. Used for sending and for the preview. */
export function campaignEmail(input: {
  to: string;
  name: string;
  subject: string;
  body: string;
  /** "html" bodies were cleaned on the way in (cleanMailHtml) and are only styled here. */
  bodyFormat: BodyFormat;
  attachments?: MailAttachment[];
}): MailMessage {
  const body =
    input.bodyFormat === "html" ? renderMailHtml(input.body) : renderCampaignBody(input.body);
  return {
    to: input.to,
    subject: input.subject,
    template: "admin_broadcast",
    html: layout(
      input.subject,
      `<p>Dear ${escapeHtml(input.name || "Colleague")},</p>
       ${body}`,
    ),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
}

/**
 * The files attached to a campaign, read once and kept while its copies go out.
 *
 * A send to the whole directory is a few hundred copies of the same few megabytes; reading them
 * from the database for every copy would move the attachment across the wire hundreds of times
 * for nothing. Only the last few campaigns are held, and each for a limited time, so a finished
 * send does not keep its files in memory.
 */
const attachmentCache = new Map<string, { at: number; files: MailAttachment[] }>();
const ATTACHMENT_CACHE_MS = 30 * 60_000;

async function campaignAttachments(sql: Sql, campaignId: string): Promise<MailAttachment[]> {
  const cached = attachmentCache.get(campaignId);
  if (cached && Date.now() - cached.at < ATTACHMENT_CACHE_MS) return cached.files;

  const rows = (await sql<Row[]>`
    select filename, content_type, content from mail_campaign_attachments
    where campaign_id = ${campaignId}
    order by id`) as unknown as { filename: string; content_type: string; content: Buffer }[];
  const files = rows.map((r) => ({
    filename: r.filename,
    contentType: r.content_type,
    content: Buffer.from(r.content),
  }));

  attachmentCache.set(campaignId, { at: Date.now(), files });
  while (attachmentCache.size > 3) {
    attachmentCache.delete(attachmentCache.keys().next().value!);
  }
  return files;
}

export type CampaignSendOutcome =
  | { result: "sent" }
  | { result: "done" }
  | { result: "retry"; error: string }
  | { result: "failed"; error: string };

/**
 * Sends one recipient's copy and records what happened.
 *
 * Claiming is the caller's job, so this only ever does the work. It never throws: an undelivered
 * email is a status, not an exception.
 */
export async function sendCampaignEmail(recipientId: string): Promise<CampaignSendOutcome> {
  const sql: Sql = await getDb();

  const [row] = (await sql<Row[]>`
    select r.id, r.status, r.employee_name, r.to_address, r.campaign_id, c.subject, c.body,
           c.body_format
    from mail_campaign_recipients r
    join mail_campaigns c on c.id = r.campaign_id
    where r.id = ${recipientId}`) as unknown as [Row | undefined];

  // Gone, already delivered, or has no address. Checked here as well as at claim time, so a job
  // replayed from Redis after a restart can't send a second copy.
  if (!row) return { result: "done" };
  const status = row["status"] as string;
  if (status === "sent" || status === "captured" || status === "logged" || status === "skipped") {
    return { result: "done" };
  }
  const address = ((row["to_address"] as string) ?? "").trim();
  if (!address) {
    await sql`
      update mail_campaign_recipients set status = 'skipped', sent_at = now()
      where id = ${recipientId}`;
    return { result: "done" };
  }

  try {
    const attachments = await campaignAttachments(sql, String(row["campaign_id"]));
    const { delivery, error } = await sendMailDetailed(
      campaignEmail({
        to: address,
        name: (row["employee_name"] as string) || "Colleague",
        subject: row["subject"] as string,
        body: row["body"] as string,
        bodyFormat: (row["body_format"] as BodyFormat) ?? "text",
        attachments,
      }),
    );
    if (delivery !== "failed") {
      await sql`
        update mail_campaign_recipients
        set status = ${delivery}, error = null, sent_at = now()
        where id = ${recipientId}`;
      return { result: "sent" };
    }
    return { result: "retry", error: error ?? "The mail server refused the message." };
  } catch (error) {
    const text = String(error).slice(0, 2000);
    return isRateLimited(error)
      ? { result: "retry", error: text }
      : { result: "failed", error: text };
  }
}

/** Writes the outcome of an attempt that didn't deliver. Mirrors the batch queue's bookkeeping. */
export async function recordCampaignAttempt(
  recipientId: string,
  outcome: { result: "retry" | "failed"; error: string },
  attemptsLeft: boolean,
  attemptsMade?: number,
): Promise<void> {
  const sql: Sql = await getDb();
  const retrying = outcome.result === "retry" && attemptsLeft;
  await sql`
    update mail_campaign_recipients
    set status = ${retrying ? "queued" : "failed"},
        error = ${outcome.error.slice(0, 2000)},
        attempts = greatest(attempts, coalesce(${attemptsMade ?? null}::int, attempts)),
        claimed_at = null,
        sent_at = ${retrying ? null : new Date()}
    where id = ${recipientId}`;
}

/** Rolls the per-recipient outcomes up onto the campaign. Stays 'sending' while any are left. */
export async function updateCampaignTotals(campaignId: string): Promise<number> {
  const sql: Sql = await getDb();
  const [pending] = (await sql<Row[]>`
    select count(*)::int as n from mail_campaign_recipients
    where campaign_id = ${campaignId} and attempts < 5 and status in ('queued', 'sending')`) as unknown as [
    { n: number },
  ];

  await sql`
    update mail_campaigns c set
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
      from mail_campaign_recipients where campaign_id = ${campaignId}
    ) t
    where c.id = ${campaignId}`;
  return pending.n;
}
