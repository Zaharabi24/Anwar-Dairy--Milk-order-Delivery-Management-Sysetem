// How fast mail may be sent, on its own so that both the transport and the queue can read it
// without importing each other.

/**
 * Messages a minute, across the whole app.
 *
 * Microsoft 365 refuses client submissions above 30 a minute per account, with
 * "421 4.4.2 Message submission rate for this client has exceeded the configured limit", and
 * once it does the connection is dropped -- which is how a burst turns into a run of failures
 * rather than one. 25 leaves room for the password resets and invitations sharing the mailbox.
 *
 * Raise it only to match what the provider actually allows: this is their limit, not ours. A
 * full directory of 360 is about a quarter of an hour at this rate, which is the floor for any
 * approach that goes through 365 -- the queue exists to make that quarter of an hour reliable,
 * not to make it shorter.
 */
export const MAIL_RATE_PER_MINUTE = (() => {
  const raw = process.env["MAIL_RATE_PER_MINUTE"]?.trim();
  const n = raw ? Number(raw) : Number.NaN;
  if (raw && !(Number.isFinite(n) && n > 0)) {
    console.warn(`[mail] MAIL_RATE_PER_MINUTE=${raw} is not a positive number; using 25.`);
  }
  return Number.isFinite(n) && n > 0 ? n : 25;
})();

/** Gap between messages that keeps the send inside the rate on its own. */
export const MAIL_INTERVAL_MS = Math.ceil(60_000 / MAIL_RATE_PER_MINUTE);

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
