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
