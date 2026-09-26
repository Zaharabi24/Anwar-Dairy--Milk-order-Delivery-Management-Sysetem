// Input validation for the Email Records query. Safe to import from client code.
import { z } from "zod";

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-20")
  .nullable();

export const emailRecordQuery = z.object({
  /** Dhaka-local calendar days, inclusive at both ends. Null means unbounded. */
  from: day,
  to: day,
  batchNo: z.string().trim().max(60).nullable(),
  status: z
    .enum(["queued", "sending", "sent", "captured", "failed", "logged", "skipped"])
    .nullable(),
  search: z.string().trim().max(200),
  limit: z.number().int().min(1).max(500),
  offset: z.number().int().min(0).max(1_000_000),
});

export type EmailRecordQuery = z.infer<typeof emailRecordQuery>;

export const EMPTY_EMAIL_QUERY: EmailRecordQuery = {
  from: null,
  to: null,
  batchNo: null,
  status: null,
  search: "",
  limit: 100,
  offset: 0,
};

export const resumePublicationInput = z.object({
  publicationId: z.string().trim().min(1).max(40),
});

/**
 * The emails to resend. Ids rather than a publication, because the System Admin chooses: the tab
 * arrives with every outstanding failure selected and they take out whoever should be left alone.
 */
export const resendEmailsInput = z.object({
  ids: z.array(z.string().trim().regex(/^\d+$/, "Not an email record")).min(1).max(1000),
});

export type ResendEmailsInput = z.infer<typeof resendEmailsInput>;
