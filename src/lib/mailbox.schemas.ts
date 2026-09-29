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
  // Long enough for a real notice, short enough that nobody pastes a document into an email. The
  // formatting editor's markup counts towards it, which is why it is more than the words need.
  .max(100_000, "That message is too long for an email.");

/** "html" is the formatting editor; "text" is how messages were written before it. */
const bodyFormat = z.enum(["text", "html"]);

/**
 * Files a message may carry, all together. Every recipient gets every file, and mail servers
 * refuse large messages outright -- Exchange's default is 10 MB, and base64 makes a file a third
 * bigger on the wire -- so this stays well inside that.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 10;

/** Kinds of file mail servers refuse or quarantine, because they run when opened. */
export const BLOCKED_EXTENSIONS = [
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "scr",
  "pif",
  "vbs",
  "vbe",
  "js",
  "jse",
  "wsf",
  "wsh",
  "ps1",
  "jar",
  "lnk",
  "reg",
  "hta",
  "cpl",
  "dll",
];

export const isBlockedFile = (name: string) =>
  BLOCKED_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() ?? "");

const attachment = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(200),
  /** The file itself, base64. Size and kind are checked again on the server after decoding. */
  data: z.string().max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 16),
});

export const composeInput = z.object({
  subject,
  body,
  bodyFormat,
  attachments: z.array(attachment).max(MAX_ATTACHMENTS, `Attach at most ${MAX_ATTACHMENTS} files.`),
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
  body: z.string().max(100_000),
  bodyFormat,
  /** Whose name the preview is addressed to, so it reads the way a recipient will see it. */
  sampleName: z.string().trim().max(120),
});

export type PreviewInput = z.infer<typeof previewInput>;

export const campaignIdInput = z.object({
  campaignId: z.string().trim().min(1).max(40),
});

/**
 * A draft being saved. Subject and message may be half-written -- that is what a draft is -- so
 * only the lengths are held to what a sent message allows. No `id` means a new draft.
 */
export const draftInput = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters."),
  body: z.string().max(100_000, "That message is too long for an email."),
});

export type DraftInput = z.infer<typeof draftInput>;

export const draftIdInput = z.object({
  id: z.string().trim().min(1).max(40),
});

/** Which draft batch emails use. Null goes back to the standard booking email. */
export const batchDraftInput = z.object({
  id: z.string().trim().min(1).max(40).nullable(),
});

/** One entry of the Sent mail list: a Mailbox message or a batch booking email. */
export const sentMailInput = z.object({
  kind: z.enum(["mailbox", "batch"]),
  id: z.string().trim().min(1).max(40),
});
