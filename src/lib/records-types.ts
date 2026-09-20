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
  status: PublishStatus;
  completedAt: string | null;
  bookedLitres: number;
  orderCount: number;
}

/** Mirrors email_outbox, plus 'skipped' for someone who had no address on file. */
export type EmailStatus = "queued" | "sent" | "captured" | "failed" | "logged" | "skipped";

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
  /** Whether this person went on to place an order against the batch. */
  ordered: boolean;
}

export interface EmailRecordPage {
  records: EmailRecordRow[];
  total: number;
}
