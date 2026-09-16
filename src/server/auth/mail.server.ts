// Transactional email. Transport, in order of preference:
//   1. Microsoft Graph  (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER_MAILBOX)
//   2. SMTP             (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_REQUIRE_TLS)
//                       SMTP_HOST may name several servers, "exch02.corp,exch01.corp". Each message
//                       goes out through the first one that accepts it, so a server that refuses
//                       the connection or the credentials is skipped instead of losing the email.
//   3. Server log only  (nothing configured; links are printed so they still work in dev)
// MAIL_CAPTURE=true marks the SMTP server as a local test inbox (Mailpit): messages are
// recorded as 'captured', never as 'sent', because they don't reach real mailboxes.
// Every message is recorded in email_outbox with its delivery status.
import type { Transporter } from "nodemailer";
import { getDb } from "../db/client.server";
import type { MailDelivery } from "@/lib/auth-types";

// HTML email can't read CSS variables, so the brand colour lives here.
const BRAND = "#3F6B52";
const BG = "#F1F5F9";
const INK = "#0F172A";

const env = (name: string) => process.env[name]?.trim() || undefined;

/** SMTP_HOST, split on commas so more than one mail server can be offered. */
const smtpHosts = (): string[] =>
  (env("SMTP_HOST") ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
const sender = () => env("MAIL_FROM") ?? env("MS_SENDER_MAILBOX") ?? "no-reply@anwargroup.net";

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export interface MailMessage {
  to: string;
  subject: string;
  template: string;
  html: string;
}

export type MailTransportKind = "graph" | "smtp" | "capture" | "none";

/** Which transport is configured right now, with a human description (no secrets). */
export function mailTransport(): { kind: MailTransportKind; description: string } {
  if (
    env("MS_TENANT_ID") &&
    env("MS_CLIENT_ID") &&
    env("MS_CLIENT_SECRET") &&
    env("MS_SENDER_MAILBOX")
  ) {
    return { kind: "graph", description: `Microsoft Graph as ${env("MS_SENDER_MAILBOX")}` };
  }
  const hosts = smtpHosts();
  if (hosts.length) {
    const port = env("SMTP_PORT") ?? 587;
    const where = hosts.map((h) => `${h}:${port}`).join(", ");
    if (env("MAIL_CAPTURE") === "true") {
      return {
        kind: "capture",
        description: `local test inbox at ${where} (not delivered to real mailboxes)`,
      };
    }
    return { kind: "smtp", description: `SMTP ${where} from ${sender()}` };
  }
  return {
    kind: "none",
    description: "no email transport configured (links are printed to the server log)",
  };
}

// ---------------------------------------------------------------------------
// Microsoft Graph

let graphToken: { value: string; expires: number } | undefined;

async function getGraphToken(): Promise<string> {
  if (graphToken && graphToken.expires > Date.now() + 60_000) return graphToken.value;
  const res = await fetch(
    `https://login.microsoftonline.com/${env("MS_TENANT_ID")}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("MS_CLIENT_ID") ?? "",
        client_secret: env("MS_CLIENT_SECRET") ?? "",
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) throw new Error(`Graph token request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  graphToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return graphToken.value;
}

async function sendViaGraph(msg: MailMessage) {
  const token = await getGraphToken();
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env("MS_SENDER_MAILBOX") ?? "")}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: msg.subject,
          body: { contentType: "HTML", content: msg.html },
          toRecipients: [{ emailAddress: { address: msg.to } }],
        },
        saveToSentItems: false,
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!res.ok) throw new Error(`Graph sendMail failed: ${res.status} ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// SMTP

/**
 * Raised when every configured host refused. `friendly` already holds the per-host reasons, so
 * the admin still sees "exch01 rejected the password" instead of only whatever the last host said.
 */
class MailHostsRefusedError extends Error {
  readonly friendly: string;
  constructor(reasons: string[]) {
    super(reasons.join("; "));
    this.name = "MailHostsRefusedError";
    this.friendly = reasons.join("; ");
  }
}

/**
 * One way to reach the mail server: an address to connect to, and whether to present credentials.
 *
 * Two on-premises Exchange servers commonly share a single name, and a single server commonly has
 * more than one receive connector, so "mail.example.net:25" is not one destination but several
 * that can disagree about authentication. Each combination is tried separately.
 */
interface SmtpCandidate {
  /** What to dial: the configured name, or one of the addresses it resolves to. */
  address: string;
  /** The configured name, kept for TLS SNI and for messages. */
  host: string;
  /** Whether to present SMTP_USER / SMTP_PASS on this attempt. */
  authenticate: boolean;
  /** Stable identity, for the connection pool and for remembering what worked. */
  id: string;
  /** Where this route points, without the authentication part. */
  where: string;
  /** How this route reads in a log line. */
  label: string;
}

// One pooled transport per candidate, so offering several routes doesn't rebuild a connection
// pool on every send.
const smtpPool = new Map<string, { key: string; transport: Transporter }>();

// The route that last delivered. Tried first, so a refusing server isn't dialled again for every
// message.
let preferredId: string | undefined;

const isIpAddress = (value: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(value);

const dnsCache = new Map<string, { at: number; addresses: string[] }>();
const DNS_TTL_MS = 300_000;

/**
 * Every address a host resolves to. This is what makes failover work when two Exchange servers
 * sit behind one name: moving from the name to the same name would just reach the same pair, so
 * the addresses have to be tried individually. A single answer keeps the name, so ordinary
 * single-server setups behave exactly as before.
 */
async function addressesFor(host: string): Promise<string[]> {
  if (isIpAddress(host) || host === "localhost") return [host];
  const hit = dnsCache.get(host);
  if (hit && Date.now() - hit.at < DNS_TTL_MS) return hit.addresses;
  let addresses = [host];
  try {
    const { resolve4 } = await import("node:dns/promises");
    const found = await resolve4(host);
    if (found.length > 1) addresses = found;
  } catch {
    // No DNS answer (a hosts-file entry, say): the name itself is still worth dialling.
  }
  dnsCache.set(host, { at: Date.now(), addresses });
  return addresses;
}

/**
 * Every route worth trying, best first.
 *
 * When credentials are configured each address is tried with them and then without. That second
 * attempt matters: an internal relay connector typically wants no credentials at all and answers
 * 535 to the ones meant for the client connector. Set SMTP_ANONYMOUS_FALLBACK=false to require
 * authentication and never fall back.
 */
async function smtpCandidates(): Promise<SmtpCandidate[]> {
  const user = env("SMTP_USER");
  const allowAnonymous = env("SMTP_ANONYMOUS_FALLBACK") !== "false";
  const targets: Array<{ address: string; host: string; where: string }> = [];
  for (const host of smtpHosts()) {
    for (const address of await addressesFor(host)) {
      targets.push({ address, host, where: address === host ? host : `${host} (${address})` });
    }
  }

  // Authenticated routes are tried across every address before any anonymous one, so a server
  // that does accept the credentials is always preferred over relaying without them.
  const list: SmtpCandidate[] = [];
  if (user) {
    for (const t of targets) {
      list.push({
        ...t,
        authenticate: true,
        id: `${t.address}|auth`,
        label: `${t.where} with SMTP_USER`,
      });
    }
  }
  if (!user || allowAnonymous) {
    for (const t of targets) {
      list.push({
        ...t,
        authenticate: false,
        id: `${t.address}|anon`,
        label: user ? `${t.where} without credentials` : t.where,
      });
    }
  }
  const i = preferredId ? list.findIndex((c) => c.id === preferredId) : -1;
  return i <= 0 ? list : [list[i]!, ...list.slice(0, i), ...list.slice(i + 1)];
}

async function smtpTransport(candidate: SmtpCandidate): Promise<Transporter> {
  const user = env("SMTP_USER");
  // Dialling an address still has to present the configured name for the certificate check.
  const servername =
    candidate.address !== candidate.host && !isIpAddress(candidate.host)
      ? candidate.host
      : undefined;
  const options = {
    host: candidate.address,
    port: Number(env("SMTP_PORT") ?? 587),
    // true = implicit TLS (port 465). On 587, STARTTLS is negotiated automatically.
    secure: env("SMTP_SECURE") === "true",
    requireTLS: env("SMTP_REQUIRE_TLS") === "true",
    // An internal server (e.g. on-premises Exchange) may use a self-signed certificate.
    tls: {
      ...(env("SMTP_TLS_REJECT_UNAUTHORIZED") === "false" ? { rejectUnauthorized: false } : {}),
      ...(servername ? { servername } : {}),
    },
    ...(candidate.authenticate && user
      ? {
          auth: { user, pass: env("SMTP_PASS") ?? "" },
          // Without this, nodemailer only logs in when that connection's EHLO happened to
          // advertise AUTH, so the same settings can authenticate on one connection and skip it
          // on the next -- which is how a startup check passes while every send fails. Forcing it
          // makes each candidate mean exactly one thing.
          forceAuth: true,
        }
      : {}),
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  const key = JSON.stringify({
    ...options,
    auth: candidate.authenticate && user ? `${user}:${(env("SMTP_PASS") ?? "").length}` : null,
  });
  const cached = smtpPool.get(candidate.id);
  if (cached?.key === key) return cached.transport;
  cached?.transport.close();
  const { createTransport } = await import("nodemailer");
  const transport = createTransport(options as Parameters<typeof createTransport>[0]);
  smtpPool.set(candidate.id, { key, transport });
  return transport;
}

/**
 * Sends through the first route that accepts the message. A route that refuses the connection,
 * the credentials or the recipient is treated as unusable and the next is tried; only when every
 * route has refused does the message count as failed. A message the server accepted but never
 * acknowledged (a timeout mid-DATA) can therefore arrive twice, which is the right trade for
 * password setup and invitation links.
 */
async function sendViaSmtp(msg: MailMessage) {
  const candidates = await smtpCandidates();
  if (!candidates.length) throw new Error("No SMTP host configured (set SMTP_HOST).");
  const refusals: string[] = [];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const transport = await smtpTransport(candidate);
      const info = await transport.sendMail({
        from: sender(),
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
      });
      if (info.rejected?.length)
        throw new Error(`SMTP server rejected ${info.rejected.join(", ")}: ${info.response}`);
      if (preferredId !== candidate.id) {
        console.info(`[mail] sending through ${candidate.label}`);
        preferredId = candidate.id;
      }
      return;
    } catch (error) {
      lastError = error;
      const why = friendlyMailError(error, candidate.host);
      refusals.push(candidates.length > 1 ? `${candidate.label}: ${why}` : why);
      if (preferredId === candidate.id) preferredId = undefined;
      if (candidates.length > 1)
        console.warn(`[mail] ${candidate.label} wouldn't take the message: ${why}`);
    }
  }
  throw candidates.length > 1 ? new MailHostsRefusedError(refusals) : lastError;
}

/** Verifies every route, so the log names the one that works and why the others don't. */
async function probeSmtpHosts(): Promise<{
  ready: SmtpCandidate | undefined;
  failures: string[];
  lastError: unknown;
}> {
  const failures: string[] = [];
  let ready: SmtpCandidate | undefined;
  let lastError: unknown;
  for (const candidate of await smtpCandidates()) {
    try {
      await (await smtpTransport(candidate)).verify();
      ready ??= candidate;
    } catch (error) {
      lastError = error;
      failures.push(`${candidate.label}: ${friendlyMailError(error, candidate.host)}`);
    }
  }
  if (ready) preferredId = ready.id;
  return { ready, failures, lastError };
}

// ---------------------------------------------------------------------------

/** Checks the configured transport without sending anything. Used at startup and by the test button. */
export async function verifyMailTransport(): Promise<{
  ok: boolean;
  kind: MailTransportKind;
  description: string;
  error?: string;
}> {
  const { kind, description } = mailTransport();
  try {
    if (kind === "graph") await getGraphToken();
    if (kind === "smtp" || kind === "capture") {
      const { ready, failures, lastError } = await probeSmtpHosts();
      if (!ready) {
        if (failures.length > 1) throw new MailHostsRefusedError(failures);
        throw lastError ?? new Error("No SMTP host configured (set SMTP_HOST).");
      }
      // Name the route email will actually leave by, and list the ones standing by or broken.
      const live = `${ready.where}:${env("SMTP_PORT") ?? 587}${
        ready.authenticate ? "" : " without credentials"
      }`;
      const aside = failures.length ? ` — not usable: ${failures.join("; ")}` : "";
      return {
        ok: true,
        kind,
        description:
          kind === "capture"
            ? `local test inbox at ${live} (not delivered to real mailboxes)${aside}`
            : `SMTP ${live} from ${sender()}${aside}`,
      };
    }
    return { ok: kind !== "none", kind, description };
  } catch (error) {
    return { ok: false, kind, description, error: friendlyMailError(error) };
  }
}

/**
 * Short, actionable explanation for common delivery failures. `host` narrows the message to one
 * server, so a failover report blames only the host that actually refused.
 */
export function friendlyMailError(error: unknown, host?: string): string {
  // Already a per-host summary; explaining it again would only lose detail.
  if (error instanceof MailHostsRefusedError) return error.friendly;
  const text = String((error as { message?: string })?.message ?? error);
  const code = (error as { code?: string; responseCode?: number })?.code;
  if (/self[- ]signed|certificate|unable to verify/i.test(text)) {
    return "The mail server's TLS certificate isn't trusted (it may be self-signed). For an internal mail server, set SMTP_TLS_REJECT_UNAUTHORIZED=false.";
  }
  if (code === "EAUTH" || /535|authentication/i.test(text)) {
    return "The mail server rejected the username or password (check SMTP_USER / SMTP_PASS; Microsoft 365 needs SMTP AUTH enabled for the mailbox).";
  }
  if (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNECTION"
  ) {
    const port = env("SMTP_PORT") ?? 587;
    const where = (host ? [host] : smtpHosts()).map((h) => `${h}:${port}`).join(" or ");
    return `Couldn't connect to the mail server (${where}). Check the host, port and firewall.`;
  }
  if (/SendAsDenied|not allowed to send|5\.7\.60/i.test(text)) {
    return "The mail account isn't allowed to send as MAIL_FROM. Use the same address as SMTP_USER or grant Send As.";
  }
  if (/Graph token request failed/i.test(text))
    return "Microsoft Graph sign-in failed (check MS_TENANT_ID, MS_CLIENT_ID and MS_CLIENT_SECRET).";
  if (/Graph sendMail failed: 403/i.test(text)) {
    return "Microsoft Graph refused to send (the app needs Mail.Send application permission with admin consent, and access to MS_SENDER_MAILBOX).";
  }
  return text.slice(0, 300);
}

/** Sends one message and records the outcome. Never throws: a mail outage mustn't undo an approval. */
export async function sendMailDetailed(
  msg: MailMessage,
): Promise<{ delivery: MailDelivery; error?: string }> {
  const sql = await getDb();
  const [row] = await sql<{ id: string }[]>`
    insert into email_outbox (to_address, subject, template)
    values (${msg.to}, ${msg.subject}, ${msg.template})
    returning id`;
  const { kind } = mailTransport();
  try {
    let status: MailDelivery;
    if (kind === "graph") {
      await sendViaGraph(msg);
      status = "sent";
    } else if (kind === "smtp" || kind === "capture") {
      await sendViaSmtp(msg);
      status = kind === "capture" ? "captured" : "sent";
    } else {
      status = "logged";
      const links = [...msg.html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      console.info(
        `[mail] (no transport configured) to=${msg.to} subject="${msg.subject}" links=${links.join(" ")}`,
      );
    }
    await sql`update email_outbox set status = ${status}, sent_at = now() where id = ${row!.id}`;
    if (status === "captured") {
      console.info(
        `[mail] captured by local test inbox (not delivered): to=${msg.to} subject="${msg.subject}"`,
      );
    }
    return { delivery: status };
  } catch (error) {
    const friendly = friendlyMailError(error);
    console.error(`[mail] delivery to ${msg.to} failed: ${friendly}`, error);
    await sql`update email_outbox set status = 'failed', error = ${String(error).slice(0, 2000)} where id = ${row!.id}`;
    return { delivery: "failed", error: friendly };
  }
}

export async function sendMail(msg: MailMessage): Promise<MailDelivery> {
  return (await sendMailDetailed(msg)).delivery;
}

/**
 * The Anwar Organic logo for the email header. Email clients fetch images over the internet,
 * so it's only included when APP_URL is a public address (not localhost).
 */
function emailLogo(): string {
  const base = env("APP_URL")?.replace(/\/+$/, "");
  if (!base || /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(base)) return "";
  return `<tr><td style="padding-bottom:16px;">
      <img src="${escapeHtml(`${base}/brand/anwar-organic-logo.png`)}" width="72" height="70"
        alt="Anwar Organic" style="display:block;border:0;width:72px;height:auto;" /></td></tr>`;
}

export function layout(heading: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:${BG};
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%"><tr><td align="center">
    <table width="560" style="background:#fff;border-radius:12px;padding:32px;">
    ${emailLogo()}
    <tr><td style="font-size:13px;color:#64748B;letter-spacing:.04em;
      text-transform:uppercase;padding-bottom:8px;">Anwar Organic</td></tr>
    <tr><td style="font-size:22px;font-weight:700;color:${INK};padding-bottom:16px;">
      ${heading}</td></tr>
    <tr><td style="font-size:15px;line-height:1.6;color:#334155;">${body}</td></tr>
    <tr><td style="padding-top:28px;font-size:12px;color:#94A3B8;
      border-top:1px solid #E2E8F0;">An Anwar Agro Farms system ·
      © 2026 Anwar Group of Industries</td></tr>
    </table></td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<div style="margin:24px 0;"><a href="${escapeHtml(href)}" style="display:inline-block;
   background:${BRAND};color:#fff;text-decoration:none;padding:12px 24px;
   border-radius:8px;font-weight:600;font-size:15px;">${escapeHtml(label)}</a></div>`;
