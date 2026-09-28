// How fast mail may be sent, on its own so that both the transport and the queue can read it
// without importing each other.

/**
 * Whether Microsoft Graph is the transport.
 *
 * Read from the environment here rather than asked of mail.server, which imports this file --
 * that is the cycle this module exists to break. It is the same four variables that module checks,
 * and it checks them in the same order, so the two cannot disagree about which route is in use.
 */
const usingGraph = () =>
  Boolean(
    process.env["MS_TENANT_ID"]?.trim() &&
    process.env["MS_CLIENT_ID"]?.trim() &&
    process.env["MS_CLIENT_SECRET"]?.trim() &&
    process.env["MS_SENDER_MAILBOX"]?.trim(),
  );

/**
 * Messages a minute, across the whole app. It depends on how they are being sent.
 *
 * **SMTP: 25.** Microsoft 365 refuses client submissions above 30 a minute per account, with
 * "421 4.4.2 Message submission rate for this client has exceeded the configured limit", and once
 * it does the connection is dropped -- which is how a burst turns into a run of failures rather
 * than one. 25 leaves room for the password resets and invitations sharing the mailbox.
 *
 * **Graph: 240.** That 30-a-minute ceiling is the SMTP AUTH client submission limit specifically.
 * Graph's sendMail is not governed by it -- Microsoft throttles it per app and mailbox at a rate
 * far above this -- so pacing a Graph send at the SMTP rate was holding a full directory to a
 * quarter of an hour for a limit that did not apply to it. Four a second is well inside what Graph
 * allows and turns that quarter of an hour into about a minute and a half.
 *
 * MAIL_RATE_PER_MINUTE overrides either. Raise it only to match what the provider actually
 * allows: the number is theirs, not ours.
 */
function resolveRate(): number {
  const raw = process.env["MAIL_RATE_PER_MINUTE"]?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  if (raw && !(Number.isFinite(n) && n > 0)) {
    console.warn(`[mail] MAIL_RATE_PER_MINUTE=${raw} is not a positive number; ignoring it.`);
  }
  if (Number.isFinite(n) && n > 0) return n;
  return usingGraph() ? 240 : 25;
}

export const MAIL_RATE_PER_MINUTE = resolveRate();

/** Gap between messages that keeps the send inside the rate on its own. */
export const MAIL_INTERVAL_MS = Math.ceil(60_000 / MAIL_RATE_PER_MINUTE);

/**
 * What the SMTP transport's own limiter allows, which is the provider's ceiling rather than our
 * pace. The queue paces at MAIL_RATE_PER_MINUTE; this sits underneath as the guard that a
 * password reset arriving mid-batch cannot push the account over the line. Setting both to the
 * same number made them two brakes in series -- the queue waited its gap, then nodemailer waited
 * again inside the send -- and the result was slower than either was asking for.
 *
 * A server stricter than 365 lowers the ceiling too: with MAIL_RATE_PER_MINUTE=5 for an
 * on-premises Exchange that allows 5, a guard left at 30 would let a burst of password resets
 * through that the server then refuses.
 */
export const SMTP_CEILING_PER_MINUTE = Math.min(30, MAIL_RATE_PER_MINUTE);

/** Attempts before an address is given up on. Covers a throttle that lasts several minutes. */
export const MAX_ATTEMPTS = 5;

/** A refusal that means "too fast", which is answered by waiting rather than by trying elsewhere. */
export function isRateLimited(error: unknown): boolean {
  const text = String(
    (error as { response?: string })?.response ?? (error as Error)?.message ?? error,
  );
  return /\b4\.4\.2\b|\b421\b|submission rate|exceeded the configured limit|too many|rate limit|throttl/i.test(
    text,
  );
}
