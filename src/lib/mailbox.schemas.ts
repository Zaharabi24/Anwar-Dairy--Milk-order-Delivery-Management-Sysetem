// Input validation for the mailbox. Safe to import from client code.
//
// Who is sending always comes from the session on the server; these only describe the message and
// who it is for, and the recipient list is re-resolved against the directory server-side.
import { z } from "zod";

const subject = z
  .string()
  .trim()
  .min(1, "Give the email a subject.")
  .max(200, "Keep the subject under 200 characters.");

const body = z
  .string()
  .trim()
  .min(1, "Write a message.")
  // Long enough for a real notice, short enough that nobody pastes a document into an email.
  .max(20_000, "That message is too long for an email.");

export const composeInput = z.object({
  subject,
  body,
  audience: z.enum(["all", "selected"]),
  /**
   * Only read when the audience is "selected", and treated as a filter over the directory rather
   * than as the recipient list itself, so an id here can never reach somebody the directory
   * wouldn't.
   */
  employeeIds: z.array(z.string().trim().min(1).max(60)).max(5_000),
});

export type ComposeInput = z.infer<typeof composeInput>;

export const previewInput = z.object({
  subject: z.string().trim().max(200),
  body: z.string().max(20_000),
  /** Whose name the preview is addressed to, so it reads the way a recipient will see it. */
  sampleName: z.string().trim().max(120),
});

export type PreviewInput = z.infer<typeof previewInput>;

export const campaignIdInput = z.object({
  campaignId: z.string().trim().min(1).max(40),
});
