// The System Admin's mailbox: composing a message, choosing who gets it, sending, and the
// record of what was sent.
//
// Every call checks `mailbox.send`. Who the recipients are is decided here, from the Employee
// Database, and never taken from the client as a finished list -- "everyone" has to mean everyone
// the server can see at that moment, and a list of specific people has to be checked against the
// directory before anything is written to it.
import { getDb } from "./db/client.server";
import { requirePermission } from "./auth/session.server";
import {
  enqueueCampaign,
  isQueueEnabled,
  resendFailedCampaign,
  resumePendingCampaigns,
} from "./mail/mail-queue.server";
import { campaignEmail, type BodyFormat } from "./mail/campaign-mail.server";
import { bookingEmail } from "./mail/batch-mail.server";
import { appUrl } from "./auth/session.server";
import { cleanMailHtml, hasMailText } from "./mail/rich-text.server";
import { mailTransport } from "./auth/mail.server";
import { AppError } from "@/lib/app-error";
import {
  isBlockedFile,
  MAX_ATTACHMENT_BYTES,
  type ComposeInput,
  type DraftInput,
  type PreviewInput,
} from "@/lib/mailbox.schemas";
import type {
  CampaignEmail,
  CampaignRecipient,
  CampaignSummary,
  MailboxAudience,
  MailDraft,
  SendResult,
  SentMail,
} from "@/lib/mailbox-types";

type Row = Record<string, string | number | boolean | Date | null>;

const iso = (value: unknown): string | null =>
  value ? new Date(value as string).toISOString() : null;

/**
 * Everyone the mailbox can write to: active, not deleted, in the directory, with an address.
 *
 * The same definition as the batch mail's recipients, minus the employee-role requirement --
 * a notice from the System Admin is not a booking link, so somebody who can't book can still be
 * told about the canteen. What it will not do is write to a row that has been switched off or
 * deleted, which is the whole point of those switches.
 */
const DIRECTORY = (sql: Awaited<ReturnType<typeof getDb>>) => sql`
  from (
    select distinct on (lower(e.company_email)) e.id
    from employees e
    where e.active and e.deleted_at is null and btrim(e.company_email) <> ''
    order by lower(e.company_email), (e.account_status is not null) desc, e.id
  ) e`;

/** Renders the message exactly as a recipient will see it, for the preview pane. */
export async function previewCampaign(input: PreviewInput): Promise<{ html: string }> {
  await requirePermission("mailbox.send");
  const message = campaignEmail({
    to: "preview@anwargroup.net",
    name: input.sampleName || "Employee name",
    subject: input.subject,
    body: input.bodyFormat === "html" ? cleanMailHtml(input.body) : input.body,
    bodyFormat: input.bodyFormat,
  });
  return { html: message.html };
}

/**
 * Microsoft Graph's sendMail takes the whole message in one request of at most 4 MB, and base64
 * makes a file a third bigger, so through Graph the files have to be smaller than through SMTP.
 */
const GRAPH_ATTACHMENT_BYTES = 3 * 1024 * 1024;

/** A file name as a mail client should show it: no folders, no control characters. */
const cleanFilename = (name: string) =>
  [...name.replace(/^.*[\\/]/, "")]
    .map((c) =>
      c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || '"<>|?*:'.includes(c) ? "_" : c,
    )
    .join("")
    .trim()
    .slice(0, 200) || "attachment";

/** Decodes and checks the files a message carries. Nothing the browser said is taken on trust. */
function readAttachments(input: ComposeInput["attachments"]) {
  const files = input.map((file) => {
    const filename = cleanFilename(file.filename);
    if (isBlockedFile(filename)) {
      throw new AppError(`${filename} can't be attached: mail servers block that kind of file.`);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) {
      throw new AppError(`${filename} didn't arrive intact. Attach it again.`);
    }
    const content = Buffer.from(file.data, "base64");
    const contentType = /^[\w.+-]+\/[\w.+-]+$/.test(file.contentType)
      ? file.contentType
      : "application/octet-stream";
    return { filename, contentType, content };
  });

  const total = files.reduce((sum, f) => sum + f.content.length, 0);
  const limit = mailTransport().kind === "graph" ? GRAPH_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
  if (total > limit) {
    throw new AppError(
      `The attachments come to ${(total / 1048576).toFixed(1)} MB; the limit is ${limit / 1048576} MB.`,
    );
  }
  return files;
}

/** How many people "everyone" currently means, so the composer can say so before anything is sent. */
export async function countAllRecipients(): Promise<{ total: number }> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  const [row] = (await sql<Row[]>`select count(*)::int as n ${DIRECTORY(sql)}`) as unknown as [
    { n: number },
  ];
  return { total: row.n };
}

/**
 * Writes the campaign and its recipient list, then hands it to the queue.
 *
 * The recipients are resolved and copied here, inside one transaction, so the record says who was
 * written to rather than who would be written to if it ran again. Nothing is sent in this call:
 * the queue sends at the rate the mail server accepts, which for the whole directory is a quarter
 * of an hour.
 */
export async function sendCampaign(input: ComposeInput): Promise<SendResult> {
  const user = await requirePermission("mailbox.send");
  const sql = await getDb();

  const subject = input.subject.trim();
  // What is stored is what the server kept of the editor's markup, never the markup itself.
  const body = input.bodyFormat === "html" ? cleanMailHtml(input.body) : input.body.trim();
  if (!subject) throw new AppError("The email needs a subject.");
  if (!(input.bodyFormat === "html" ? hasMailText(body) : body)) {
    throw new AppError("The email needs a message.");
  }
  const attachments = readAttachments(input.attachments);

  const audience: MailboxAudience = input.audience;
  if (audience === "selected" && input.employeeIds.length === 0) {
    throw new AppError("Choose at least one employee, or switch to everyone.");
  }

  const campaignId = await sql.begin(async (tx) => {
    // Resolved from the directory, never from what the client sent. For a specific list the ids
    // are a filter over the same query, so an id that is inactive, deleted, made up, or has no
    // address simply isn't there -- it cannot be used to reach somebody the directory wouldn't.
    // One address, one email, for the same reasons the batch mail does it: a person who holds two
    // rows would otherwise be written to twice.
    const people =
      audience === "all"
        ? await tx<Row[]>`
            select * from (
              select distinct on (lower(e.company_email))
                     e.id, e.name, e.company_email, e.department, e.designation, e.site,
                     coalesce(b.name, '') as business_unit
              from employees e
              left join business_units b on b.code = e.business_unit_code
              where e.active and e.deleted_at is null and btrim(e.company_email) <> ''
              order by lower(e.company_email), (e.account_status is not null) desc, e.id
            ) one_each
            order by name, id`
        : await tx<Row[]>`
            select * from (
              select distinct on (lower(e.company_email))
                     e.id, e.name, e.company_email, e.department, e.designation, e.site,
                     coalesce(b.name, '') as business_unit
              from employees e
              left join business_units b on b.code = e.business_unit_code
              where e.active and e.deleted_at is null and btrim(e.company_email) <> ''
                and e.id = any(${input.employeeIds}::text[])
              order by lower(e.company_email), (e.account_status is not null) desc, e.id
            ) one_each
            order by name, id`;

    if (!people.length) {
      throw new AppError(
        audience === "all"
          ? "There is nobody active in the Employee Database with an address to write to."
          : "None of the people you chose are active with an address on file.",
      );
    }

    const [campaign] = (await tx<Row[]>`
      insert into mail_campaigns (subject, body, body_format, audience, recipients, sent_by,
                                  sent_by_id)
      values (${subject}, ${body}, ${input.bodyFormat}, ${audience}, ${people.length},
              ${user.fullName}, ${user.employeeId})
      returning id`) as unknown as [{ id: string }];

    for (const file of attachments) {
      await tx`
        insert into mail_campaign_attachments
          (campaign_id, filename, content_type, size_bytes, content)
        values (${campaign.id}, ${file.filename}, ${file.contentType}, ${file.content.length},
                ${file.content})`;
    }

    await tx`insert into mail_campaign_recipients ${tx(
      people.map((p) => ({
        campaign_id: campaign.id,
        employee_id: p["id"] as string,
        employee_name: (p["name"] as string) ?? "",
        employee_ref: p["id"] as string,
        to_address: ((p["company_email"] as string) ?? "").trim(),
        department: (p["department"] as string) ?? "",
        designation: (p["designation"] as string) ?? "",
        business_unit: (p["business_unit"] as string) ?? "",
        location: (p["site"] as string) ?? "",
      })),
    )}`;

    // The same audit trail every other consequential action writes to.
    await tx`
      insert into audit_logs (actor, action, record, old_value, new_value)
      values (${user.fullName}, ${audience === "all" ? "Emailed all employees" : "Emailed selected employees"},
              ${`Mailbox #${campaign.id}`}, ${subject},
              ${`${people.length} recipients${attachments.length ? `, ${attachments.length} attachment(s)` : ""}`})`;

    return campaign.id;
  });

  const queued = await enqueueCampaign(campaignId);
  return { campaignId, recipients: queued, durable: isQueueEnabled() };
}

/** The history list: what was sent, to how many, and how it went. */
export async function listCampaigns(): Promise<CampaignSummary[]> {
  await requirePermission("mailbox.send");

  // Opening the history is a good moment to make sure anything a restart interrupted is moving.
  await resumePendingCampaigns().catch((error: unknown) =>
    console.error("[mail] resuming campaigns failed", error),
  );

  const sql = await getDb();
  const rows = await sql<Row[]>`
    select c.id, c.subject, c.body, c.audience, c.recipients, c.sent_count, c.failed_count,
           c.status, c.sent_by, c.created_at, c.completed_at,
           (select count(*) from mail_campaign_recipients r
             where r.campaign_id = c.id and r.attempts < 5
               and r.status in ('queued', 'sending')) as pending_count
    from mail_campaigns c
    order by c.created_at desc, c.id desc
    limit 200`;

  return rows.map((r) => ({
    id: String(r["id"]),
    subject: r["subject"] as string,
    body: r["body"] as string,
    audience: r["audience"] as MailboxAudience,
    recipients: Number(r["recipients"]),
    sentCount: Number(r["sent_count"]),
    failedCount: Number(r["failed_count"]),
    pendingCount: Number(r["pending_count"]),
    status: r["status"] as CampaignSummary["status"],
    sentBy: (r["sent_by"] as string) || "—",
    createdAt: iso(r["created_at"])!,
    completedAt: iso(r["completed_at"]),
  }));
}

/** Who one campaign went to, and what happened to each copy. */
export async function listCampaignRecipients(input: {
  campaignId: string;
}): Promise<CampaignRecipient[]> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id, employee_id, employee_name, employee_ref, to_address, department, designation,
           business_unit, location, status, error, sent_at
    from mail_campaign_recipients
    where campaign_id = ${input.campaignId}
    order by employee_name, id
    limit 2000`;

  return rows.map((r) => ({
    id: String(r["id"]),
    employeeId: (r["employee_id"] as string) ?? null,
    employeeName: (r["employee_name"] as string) ?? "",
    employeeRef: (r["employee_ref"] as string) ?? "",
    toAddress: (r["to_address"] as string) ?? "",
    department: (r["department"] as string) ?? "",
    designation: (r["designation"] as string) ?? "",
    businessUnit: (r["business_unit"] as string) ?? "",
    location: (r["location"] as string) ?? "",
    status: r["status"] as CampaignRecipient["status"],
    error: (r["error"] as string) ?? null,
    sentAt: iso(r["sent_at"]),
  }));
}

/**
 * Every email the Mailbox has sent, one row per recipient, newest first.
 *
 * One query rather than a list of sends and a dialog per send: the question asked here is "did
 * this reach this person", and answering it used to mean knowing which bulk send to open first.
 * The campaign's subject and date ride along on each row so the flat list still says what the
 * message was.
 *
 * Capped, because a handful of sends to the whole directory is already thousands of rows and the
 * screen filters what it is given.
 */
export async function listCampaignEmails(): Promise<CampaignEmail[]> {
  await requirePermission("mailbox.send");

  // Same as opening the history: a good moment to put back anything a restart interrupted.
  await resumePendingCampaigns().catch((error: unknown) =>
    console.error("[mail] resuming campaigns failed", error),
  );

  const sql = await getDb();
  const rows = await sql<Row[]>`
    select r.id, r.campaign_id, r.employee_id, r.employee_name, r.employee_ref, r.to_address,
           r.department, r.designation, r.business_unit, r.location, r.status, r.error, r.sent_at,
           c.subject, c.sent_by, c.created_at
    from mail_campaign_recipients r
    join mail_campaigns c on c.id = r.campaign_id
    order by c.created_at desc, c.id desc, r.employee_name, r.id
    limit 5000`;

  return rows.map((r) => ({
    id: String(r["id"]),
    campaignId: String(r["campaign_id"]),
    subject: (r["subject"] as string) ?? "",
    sentBy: (r["sent_by"] as string) || "—",
    createdAt: iso(r["created_at"])!,
    employeeId: (r["employee_id"] as string) ?? null,
    employeeName: (r["employee_name"] as string) ?? "",
    employeeRef: (r["employee_ref"] as string) ?? "",
    toAddress: (r["to_address"] as string) ?? "",
    department: (r["department"] as string) ?? "",
    designation: (r["designation"] as string) ?? "",
    businessUnit: (r["business_unit"] as string) ?? "",
    location: (r["location"] as string) ?? "",
    status: r["status"] as CampaignRecipient["status"],
    error: (r["error"] as string) ?? null,
    sentAt: iso(r["sent_at"]),
  }));
}

/** Puts a campaign's outstanding messages back on the queue, for an admin who wants to nudge it. */
export async function resumeCampaign(input: { campaignId: string }) {
  await requirePermission("mailbox.send");
  const queued = await enqueueCampaign(input.campaignId);
  return { queued, durable: isQueueEnabled() };
}

/** Tries the messages that finally failed, and only those. Delivered ones are never touched. */
export async function resendFailedMail(input: { campaignId: string }) {
  await requirePermission("mailbox.send");
  const queued = await resendFailedCampaign(input.campaignId);
  return { queued, durable: isQueueEnabled() };
}

// ---------------------------------------------------------------------------
// Drafts

const toDraft = (r: Row): MailDraft => ({
  id: String(r["id"]),
  subject: (r["subject"] as string) ?? "",
  body: (r["body"] as string) ?? "",
  useForBatches: Boolean(r["use_for_batches"]),
  createdBy: (r["created_by"] as string) || "—",
  updatedBy: (r["updated_by"] as string) || "—",
  createdAt: iso(r["created_at"])!,
  updatedAt: iso(r["updated_at"])!,
});

/** Every saved draft, the one used for batch emails first, then the most recently changed. */
export async function listDrafts(): Promise<MailDraft[]> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  const rows = await sql<Row[]>`
    select id, subject, body, use_for_batches, created_by, updated_by, created_at, updated_at
    from mail_drafts
    order by use_for_batches desc, updated_at desc, id desc
    limit 500`;
  return rows.map(toDraft);
}

/**
 * Creates or updates a draft. The body is cleaned exactly as a sent message's is, so a draft
 * that later becomes the batch email carries nothing a sent message couldn't.
 */
export async function saveDraft(input: DraftInput): Promise<MailDraft> {
  const user = await requirePermission("mailbox.send");
  const sql = await getDb();
  const subject = input.subject.trim();
  const cleaned = cleanMailHtml(input.body);
  const body = hasMailText(cleaned) ? cleaned : "";
  if (!subject && !body) throw new AppError("Write a subject or a message before saving.");

  if (input.id) {
    const [row] = await sql<Row[]>`
      select use_for_batches from mail_drafts where id = ${input.id}`;
    if (!row) throw new AppError("That draft no longer exists.");
    // The batch email can't be left without words, or publishing would send a blank message.
    if (row["use_for_batches"] && (!subject || !body)) {
      throw new AppError(
        "This draft is used for batch emails, so it needs both a subject and a message.",
      );
    }
    const [updated] = await sql<Row[]>`
      update mail_drafts
      set subject = ${subject}, body = ${body}, updated_by = ${user.fullName}, updated_at = now()
      where id = ${input.id}
      returning *`;
    return toDraft(updated!);
  }

  const [created] = await sql<Row[]>`
    insert into mail_drafts (subject, body, created_by, created_by_id, updated_by)
    values (${subject}, ${body}, ${user.fullName}, ${user.employeeId}, ${user.fullName})
    returning *`;
  return toDraft(created!);
}

/** Deletes a draft. Batches already published with it keep their own copy of the wording. */
export async function deleteDraft(input: { id: string }): Promise<{ ok: true }> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  await sql`delete from mail_drafts where id = ${input.id}`;
  return { ok: true };
}

/**
 * Chooses the draft batch emails use from the next publish on, or (null) goes back to the
 * standard booking email. Batches already published are not affected.
 */
export async function setBatchDraft(input: { id: string | null }): Promise<{ ok: true }> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  await sql.begin(async (tx) => {
    if (input.id) {
      const [row] = await tx<Row[]>`
        select subject, body from mail_drafts where id = ${input.id} for update`;
      if (!row) throw new AppError("That draft no longer exists.");
      if (!(row["subject"] as string).trim() || !(row["body"] as string).trim()) {
        throw new AppError("Give the draft a subject and a message before using it for batches.");
      }
    }
    // Cleared first: the unique index allows only one draft marked at a time.
    await tx`update mail_drafts set use_for_batches = false where use_for_batches`;
    if (input.id) {
      await tx`update mail_drafts set use_for_batches = true where id = ${input.id}`;
    }
  });
  return { ok: true };
}

/** An example batch, for showing what a batch email will look like before one is published. */
function sampleBatch() {
  const cutoff = new Date(Date.now() + 6 * 3_600_000);
  return {
    batch_no: "SAMPLE-BATCH",
    rate_per_litre: 92,
    saleable_litres: 500,
    booking_cutoff: cutoff,
    delivery_date: new Date(cutoff.getTime() + 24 * 3_600_000),
    delivery_window: "4:00 PM – 6:30 PM",
    note: null,
  };
}

/** A draft as the batch email it would become, with example batch details. */
export async function previewDraftAsBatch(input: DraftInput): Promise<{ html: string }> {
  await requirePermission("mailbox.send");
  const message = bookingEmail({
    to: "preview@anwargroup.net",
    name: "Employee name",
    batch: sampleBatch(),
    collectionPoint: "Collection point",
    link: `${appUrl()}/book`,
    draft: { subject: input.subject.trim() || "(no subject)", body: cleanMailHtml(input.body) },
  });
  return { html: message.html };
}

// ---------------------------------------------------------------------------
// Sent mail: the messages, not the people

/**
 * Every message that went out to employees, newest first: each Mailbox send, and the booking
 * email of each batch publication. Nothing new is stored for this -- both were always recorded.
 */
export async function listSentMail(): Promise<SentMail[]> {
  await requirePermission("mailbox.send");
  const sql = await getDb();
  const standard = "Today's milk is open for booking — ";
  const rows = await sql<Row[]>`
    select * from (
      select 'mailbox' as kind, c.id, c.subject, null::text as batch_no, false as from_draft,
             c.recipients, c.sent_count, c.failed_count, c.sent_by, c.created_at
      from mail_campaigns c
      union all
      select 'batch' as kind, p.id, coalesce(p.mail_subject, ${standard} || p.batch_no),
             p.batch_no, p.mail_subject is not null,
             p.recipients, p.sent_count, p.failed_count, p.published_by, p.published_at
      from batch_publications p
    ) sent
    order by created_at desc, id desc
    limit 500`;
  return rows.map((r) => ({
    kind: r["kind"] as SentMail["kind"],
    id: String(r["id"]),
    subject: (r["subject"] as string) ?? "",
    batchNo: (r["batch_no"] as string) ?? null,
    fromDraft: Boolean(r["from_draft"]),
    recipients: Number(r["recipients"]),
    sentCount: Number(r["sent_count"]),
    failedCount: Number(r["failed_count"]),
    sentBy: (r["sent_by"] as string) || "—",
    createdAt: iso(r["created_at"])!,
  }));
}

/** One sent message rendered as its recipients got it, greeted with a placeholder name. */
export async function previewSentMail(input: {
  kind: "mailbox" | "batch";
  id: string;
}): Promise<{ html: string }> {
  await requirePermission("mailbox.send");
  const sql = await getDb();

  if (input.kind === "mailbox") {
    const [c] = await sql<Row[]>`
      select subject, body, body_format from mail_campaigns where id = ${input.id}`;
    if (!c) throw new AppError("That message no longer exists.");
    return {
      html: campaignEmail({
        to: "preview@anwargroup.net",
        name: "Employee name",
        subject: c["subject"] as string,
        body: c["body"] as string,
        bodyFormat: c["body_format"] as BodyFormat,
      }).html,
    };
  }

  // The publication's own copy of the batch: what the send was told to say on the day.
  const [p] = await sql<Row[]>`
    select batch_no, booking_cutoff, delivery_date, delivery_window, rate_per_litre,
           saleable_litres, collection_points, mail_subject, mail_body
    from batch_publications where id = ${input.id}`;
  if (!p) throw new AppError("That batch email no longer exists.");
  return {
    html: bookingEmail({
      to: "preview@anwargroup.net",
      name: "Employee name",
      batch: {
        batch_no: p["batch_no"] as string,
        rate_per_litre: p["rate_per_litre"] as string,
        saleable_litres: Number(p["saleable_litres"]),
        booking_cutoff: p["booking_cutoff"] as Date,
        delivery_date: p["delivery_date"] as Date,
        delivery_window: (p["delivery_window"] as string) ?? "",
        note: null,
      },
      collectionPoint: (p["collection_points"] as string) || "To be confirmed",
      link: `${appUrl()}/book`,
      draft: p["mail_subject"]
        ? { subject: p["mail_subject"] as string, body: (p["mail_body"] as string) ?? "" }
        : null,
    }).html,
  };
}
