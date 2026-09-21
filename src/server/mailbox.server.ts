// The System Admin's mailbox: composing a message, choosing who gets it, sending, and the
// record of what was sent.
//
// Every call checks `mailbox.send`. Who the recipients are is decided here, from the Employee
// Database, and never taken from the client as a finished list -- "everyone" has to mean everyone
// the server can see at that moment, and a list of specific people has to be checked against the
// directory before anything is written to it.
import { getDb } from "./db/client.server";
import { requirePermission } from "./auth/session.server";
import { enqueueCampaign, isQueueEnabled, resumePendingCampaigns } from "./mail/mail-queue.server";
import { campaignEmail } from "./mail/campaign-mail.server";
import { AppError } from "@/lib/app-error";
import type { ComposeInput, PreviewInput } from "@/lib/mailbox.schemas";
import type {
  CampaignRecipient,
  CampaignSummary,
  MailboxAudience,
  SendResult,
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
    body: input.body,
  });
  return { html: message.html };
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
  const body = input.body.trim();
  if (!subject) throw new AppError("The email needs a subject.");
  if (!body) throw new AppError("The email needs a message.");

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
      insert into mail_campaigns (subject, body, audience, recipients, sent_by, sent_by_id)
      values (${subject}, ${body}, ${audience}, ${people.length}, ${user.fullName},
              ${user.employeeId})
      returning id`) as unknown as [{ id: string }];

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
              ${`Mailbox #${campaign.id}`}, ${subject}, ${`${people.length} recipients`})`;

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

/** Puts a campaign's outstanding messages back on the queue, for an admin who wants to nudge it. */
export async function resumeCampaign(input: { campaignId: string }) {
  await requirePermission("mailbox.send");
  const queued = await enqueueCampaign(input.campaignId);
  return { queued, durable: isQueueEnabled() };
}
