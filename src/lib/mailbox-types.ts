// Shapes shared by the mailbox screen and the server that fills it. Types only, safe on the client.

/** Who a message went to: everyone in the directory, or a list the System Admin picked. */
export type MailboxAudience = "all" | "selected";

/** How a campaign's send ended. 'sending' until the last copy has been attempted. */
export type CampaignStatus = "sending" | "sent" | "partial" | "failed" | "no_recipients";

/** Mirrors email_outbox, plus 'skipped' for somebody who had no address to write to. */
export type RecipientStatus =
  "queued" | "sending" | "sent" | "captured" | "failed" | "logged" | "skipped";

/** One message from the mailbox, as the history lists it. */
export interface CampaignSummary {
  id: string;
  subject: string;
  /** The message as it was typed, so the history can show what was actually said. */
  body: string;
  audience: MailboxAudience;
  recipients: number;
  sentCount: number;
  failedCount: number;
  /** Still to send, so an interrupted run is visible rather than silently stalled. */
  pendingCount: number;
  status: CampaignStatus;
  sentBy: string;
  createdAt: string;
  completedAt: string | null;
}

/**
 * One copy of a message, with the directory details it carried.
 *
 * Copied at send time, not joined: this is who was written to on the day, and somebody changing
 * department or leaving afterwards must not rewrite it.
 */
export interface CampaignRecipient {
  id: string;
  /** Null once the person has been deleted from the directory; the copied details remain. */
  employeeId: string | null;
  employeeName: string;
  employeeRef: string;
  toAddress: string;
  department: string;
  designation: string;
  businessUnit: string;
  location: string;
  status: RecipientStatus;
  error: string | null;
  sentAt: string | null;
}

export interface SendResult {
  campaignId: string;
  recipients: number;
  /** Whether the queue is backed by Redis and so survives a restart. */
  durable: boolean;
}

/**
 * One email to one person, as the history lists it.
 *
 * The history used to be a list of sends -- one row for a message to three hundred people, with
 * the individuals behind a dialog. This is the other way round: the unit is the email that
 * arrived, or didn't, because that is what somebody is looking for when they come here. The
 * campaign it belonged to travels with it so the row can still say what was sent and when.
 */
export interface CampaignEmail extends CampaignRecipient {
  campaignId: string;
  subject: string;
  sentBy: string;
  /** When the send was composed, which is the date the history is ordered and filtered on. */
  createdAt: string;
}

/** A message saved in the Mailbox to finish later, or to be the wording of the batch email. */
export interface MailDraft {
  id: string;
  subject: string;
  /** The editor's HTML, as the server kept it. */
  body: string;
  /** Whether publishing a batch sends this instead of the standard booking email. */
  useForBatches: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * One message that went out to employees, as the Sent mail list shows it: the message, not the
 * people. A Mailbox send, or the booking email of one batch publication.
 */
export interface SentMail {
  kind: "mailbox" | "batch";
  id: string;
  subject: string;
  /** For a batch email: the batch it announced. */
  batchNo: string | null;
  /** For a batch email: whether it used a Mailbox draft rather than the standard wording. */
  fromDraft: boolean;
  recipients: number;
  sentCount: number;
  failedCount: number;
  sentBy: string;
  createdAt: string;
}
