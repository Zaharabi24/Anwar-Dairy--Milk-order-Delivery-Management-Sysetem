// Transactional email. Transport, in order of preference:
//   1. Microsoft Graph  (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SENDER_MAILBOX)
//   2. SMTP             (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_REQUIRE_TLS)
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
  const host = env("SMTP_HOST");
  if (host) {
    const where = `${host}:${env("SMTP_PORT") ?? 587}`;
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

let smtp: { key: string; transport: Transporter } | undefined;

async function smtpTransport(): Promise<Transporter> {
  const user = env("SMTP_USER");
  const options = {
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT") ?? 587),
    // true = implicit TLS (port 465). On 587, STARTTLS is negotiated automatically.
    secure: env("SMTP_SECURE") === "true",
    requireTLS: env("SMTP_REQUIRE_TLS") === "true",
    // An internal server (e.g. on-premises Exchange) may use a self-signed certificate.
    ...(env("SMTP_TLS_REJECT_UNAUTHORIZED") === "false"
      ? { tls: { rejectUnauthorized: false } }
      : {}),
    ...(user ? { auth: { user, pass: env("SMTP_PASS") ?? "" } } : {}),
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
  const key = JSON.stringify({
    ...options,
    auth: user ? `${user}:${(env("SMTP_PASS") ?? "").length}` : null,
  });
  if (smtp?.key === key) return smtp.transport;
  smtp?.transport.close();
  const { createTransport } = await import("nodemailer");
  smtp = { key, transport: createTransport(options) };
  return smtp.transport;
}

async function sendViaSmtp(msg: MailMessage) {
  const transport = await smtpTransport();
  const info = await transport.sendMail({
    from: sender(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
  });
  if (info.rejected?.length)
    throw new Error(`SMTP server rejected ${info.rejected.join(", ")}: ${info.response}`);
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
    if (kind === "smtp" || kind === "capture") await (await smtpTransport()).verify();
    return { ok: kind !== "none", kind, description };
  } catch (error) {
    return { ok: false, kind, description, error: friendlyMailError(error) };
  }
}

/** Short, actionable explanation for common delivery failures. */
export function friendlyMailError(error: unknown): string {
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
    return `Couldn't connect to the mail server (${env("SMTP_HOST")}:${env("SMTP_PORT") ?? 587}). Check the host, port and firewall.`;
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
