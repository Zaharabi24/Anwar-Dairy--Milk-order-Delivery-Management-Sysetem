// Shapes shared by the Publish Records and Email Records screens and the server that fills them.
// Safe to import from client code: types only.

/** How a publish's mail run ended. 'sending' until the last message has been attempted. */
export type PublishStatus = "sending" | "sent" | "partial" | "failed" | "no_recipients";

/** One batch publish: who sent it, to how many, and what came of it. */
export interface PublishRecord {
  id: string;
  batchNo: string;
  product: string;
  /** The batch's status now, which can have moved on since it was published. */
  batchStatus: string;
  publishedAt: string;
  publishedBy: string;
  bookingCutoff: string;
  deliveryDate: string;
  deliveryWindow: string;
  ratePerLitre: number;
  saleableLitres: number;
  collectionPoints: string;
  recipients: number;
  sentCount: number;
  failedCount: number;
  /** In the directory and active, but with no address to send to. */
  skippedCount: number;
  /** Still to send, including failures worth retrying. Above zero means the send is unfinished. */
  pendingCount: number;
  status: PublishStatus;
  completedAt: string | null;
  bookedLitres: number;
  orderCount: number;
}

/**
 * Mirrors email_outbox, plus two of ours: 'sending' is a claim on the row while it is in flight,
 * and 'skipped' is somebody active who had no address to write to.
 */
export type EmailStatus =
  "queued" | "sending" | "sent" | "captured" | "failed" | "logged" | "skipped";

/**
 * One email, with the directory details it carried.
 *
 * These are copies taken at send time, not a live join: a person who later changes department or
 * leaves must not silently rewrite what this record says was sent.
 */
export interface EmailRecordRow {
  id: string;
  batchNo: string;
  /** Null once the person has been deleted from the directory; the copied details remain. */
  employeeId: string | null;
  employeeName: string;
  employeeRef: string;
  toAddress: string;
  department: string;
  designation: string;
  phone: string;
  location: string;
  status: EmailStatus;
  error: string | null;
  collectionPoints: string;
  linkExpiresAt: string | null;
  createdAt: string;
  sentAt: string | null;
  /** How many times sending this row has been tried. */
  attempts: number;
  /**
   * Whether a later attempt has been made at this message.
   *
   * True only on the earlier row of a pair: a failure that was resent. What became of the retry is
   * the retry's own record, which is why a resend leaves two rows rather than rewriting one.
   */
  resent: boolean;
  /** Whether this person went on to place an order against the batch. */
  ordered: boolean;
}

export interface EmailRecordPage {
  records: EmailRecordRow[];
  /** Every email the filters match, not just the page of them being shown. */
  total: number;
  /** Of those, how many the mail server took. */
  sent: number;
  /** Of those, how many it refused for good, counting every attempt that ended that way. */
  failed: number;
  /** Of those failures, how many nothing has been done about yet -- the Resend tab's work. */
  unresolved: number;
  /** Of those, how many led to an order that still stands. */
  booked: number;
}
