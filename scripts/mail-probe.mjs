#!/usr/bin/env node
// Finds which mail server actually accepts our email.
//
// Tries every host x port x auth-mode combination and reports, for each one, how far it got:
// connect -> STARTTLS -> AUTH -> RCPT. Use it when SMTP delivery fails and there is more than one
// candidate server (e.g. Exchange 01 and Exchange 02), to see which one to put in SMTP_HOST.
//
//   node scripts/mail-probe.mjs --hosts exch01.corp.local,exch02.corp.local \
//     --user 'DOMAIN\svc-mailer' --pass 'secret' \
//     --from no-reply@anwargroup.net --to you@anwargroup.net
//
// By default nothing is sent: the probe stops once the server has accepted the connection, TLS
// and the credentials. That is what the approval-email failure was about. It does NOT prove the
// server will relay to a given recipient -- add --send for that, which delivers a real message.
import net from "node:net";
import { resolve4 } from "node:dns/promises";
import { createTransport } from "nodemailer";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const hosts = (flag("hosts", process.env.SMTP_HOST ?? "") || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const ports = (flag("ports", "587,25,465") || "")
  .split(",")
  .map((p) => Number(p.trim()))
  .filter(Boolean);
const user = flag("user", process.env.SMTP_USER);
const pass = flag("pass", process.env.SMTP_PASS);
const from = flag("from", process.env.MAIL_FROM ?? "no-reply@anwargroup.net");
const to = flag("to", from);
const reallySend = has("send");
// By default STARTTLS is required on every port except 25 and 465. --no-require-tls relaxes that,
// which is worth a try when a server reports "wrong version number" or has no TLS at all.
const requireTls = !has("no-require-tls");

if (!hosts.length) {
  console.error(
    "Usage: node scripts/mail-probe.mjs --hosts host1,host2 [--ports 587,25,465]\n" +
      "       [--user USER --pass PASS] [--from addr] [--to addr] [--no-require-tls] [--send]",
  );
  process.exit(1);
}

/**
 * Reads the EHLO greeting. Which AUTH mechanisms a server offers is usually the whole story:
 * nodemailer speaks LOGIN, PLAIN, CRAM-MD5 and XOAUTH2, so a server offering only NTLM or GSSAPI
 * (Exchange's internal server-to-server connector) answers 535 however correct the password is.
 */
function greeting(host, port, timeout = 8000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let out = "";
    let sent = false;
    const done = () => {
      socket.destroy();
      const auth = /^250[- ]AUTH\s+([^\r\n]*)/im.exec(out);
      resolve({
        server: /^220 ([^\s]+)/m.exec(out)?.[1],
        auth: auth ? auth[1].trim().split(/\s+/) : [],
      });
    };
    socket.setTimeout(timeout);
    socket.on("data", (b) => {
      out += b.toString();
      if (!sent && /^220 /m.test(out)) {
        sent = true;
        socket.write("EHLO mail-probe.local\r\n");
      } else if (sent && /^250 [^\n]*\r?\n/m.test(out)) {
        socket.write("QUIT\r\n");
        done();
      }
    });
    socket.once("timeout", done);
    socket.once("error", done);
  });
}

/** Every address a name resolves to: two mail servers often share one name. */
async function addressesFor(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return [host];
  try {
    const found = await resolve4(host);
    return found.length > 1 ? found : [host];
  } catch {
    return [host];
  }
}

/** Plain TCP reachability, so an unreachable host is never mistaken for a rejecting one. */
function reachable(host, port, timeout = 6000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done({ ok: true }));
    socket.once("timeout", () => done({ ok: false, reason: "timed out" }));
    socket.once("error", (e) => done({ ok: false, reason: e.code ?? e.message }));
  });
}

/**
 * One full SMTP conversation. `authenticate` false tests anonymous relay, which is how most
 * on-premises Exchange receive connectors are set up for internal applications.
 */
async function probe(host, port, authenticate, servername) {
  const transport = createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: requireTls && port !== 465 && port !== 25,
    tls: { rejectUnauthorized: false, ...(servername ? { servername } : {}) },
    ...(authenticate ? { auth: { user, pass } } : {}),
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    logger: false,
  });
  try {
    // verify() runs connect + EHLO + STARTTLS + AUTH and throws on the first failure.
    // connect + EHLO + STARTTLS + AUTH; throws on the first step that fails.
    await transport.verify();
    if (!reallySend) return { stage: "ready", ok: true };
    const info = await transport.sendMail({
      from,
      to,
      subject: `Anwar Organic mail probe via ${host}:${port}`,
      text: `Delivered through ${host}:${port} with ${authenticate ? "authentication" : "anonymous relay"}.`,
    });
    return { stage: "sent", ok: true, detail: info.response };
  } catch (error) {
    return {
      stage: "failed",
      ok: false,
      detail: `${error.code ?? ""} ${error.responseCode ?? ""} ${error.message}`.trim(),
    };
  } finally {
    transport.close();
  }
}

const results = [];
// A name answered by more than one server is tested per address, so the working one is named.
const targets = [];
for (const name of hosts) {
  for (const address of await addressesFor(name)) {
    targets.push({
      name,
      address,
      label: address === name ? name : `${name} (${address})`,
      // Filled in from the EHLO greeting below.
      usableAuth: false,
      hadGreeting: false,
    });
  }
}

for (const target of targets) {
  const { address: host, label } = target;
  console.log(`\n=== ${label} ===`);
  for (const port of ports) {
    const tcp = await reachable(host, port);
    if (!tcp.ok) {
      console.log(`  :${port}  unreachable (${tcp.reason})`);
      results.push({ host, port, auth: null, ok: false, detail: `unreachable: ${tcp.reason}` });
      continue;
    }
    const hello = await greeting(host, port);
    if (hello.server) {
      const usable = hello.auth.filter((m) => /^(LOGIN|PLAIN|CRAM-MD5|XOAUTH2)$/i.test(m));
      target.usableAuth = usable.length > 0;
      target.hadGreeting = true;
      const note =
        hello.auth.length && !usable.length
          ? "  <-- no mechanism we can speak; this server answers 535 whatever the password"
          : "";
      console.log(
        `  :${port}  ${hello.server} · AUTH ${hello.auth.join(" ") || "(none offered)"}${note}`,
      );
    }
    const modes = user ? [false, true] : [false];
    for (const authenticate of modes) {
      const label = authenticate ? "with AUTH " : "anonymous ";
      const r = await probe(
        host,
        port,
        authenticate,
        host === target.name ? undefined : target.name,
      );
      console.log(
        `  :${port}  ${label} ${r.ok ? "OK" : "FAIL"}${r.detail ? ` - ${r.detail}` : ""}`,
      );
      results.push({ host, port, auth: authenticate, ok: r.ok, detail: r.detail, target });
    }
  }
}

const working = results.filter((r) => r.ok);
console.log("\n--- summary ---");
if (!working.length) {
  console.log("No combination worked. The detail column above says why for each one.");
  process.exit(2);
}
for (const w of working) {
  console.log(
    `WORKS: ${w.host}:${w.port} ${w.auth ? "with SMTP_USER/SMTP_PASS" : "anonymous (no SMTP_USER)"}`,
  );
}
// Prefer, in order: a server that accepted our credentials; a server offering an AUTH mechanism
// we can speak, so setting credentials later won't start failing; then whatever answered first.
// Anonymous relay is often locked to particular source IPs, so it can pass here yet refuse the
// real recipient -- which is why --send exists.
const best =
  (user ? working.find((w) => w.auth) : undefined) ??
  working.find((w) => w.target?.usableAuth) ??
  working[0];
const unusable = targets.filter((t) => t.hadGreeting && !t.usableAuth);
if (unusable.length) {
  console.log("");
  for (const t of unusable) {
    console.log(
      `NOTE: ${t.label} offers no AUTH mechanism this client can use, so it answers 535 to any password.`,
    );
  }
}
console.log("\nSet these in Dokploy -> Environment:");
console.log(`  SMTP_HOST=${best.host}`);
console.log(`  SMTP_PORT=${best.port}`);
console.log(`  SMTP_SECURE=${best.port === 465}`);
console.log(`  SMTP_REQUIRE_TLS=${requireTls && best.port !== 465 && best.port !== 25}`);
console.log("  SMTP_TLS_REJECT_UNAUTHORIZED=false");
console.log(
  best.auth
    ? "  SMTP_USER / SMTP_PASS: keep the current values"
    : "  SMTP_USER= and SMTP_PASS= (leave both empty)",
);
console.log("  MAIL_CAPTURE=false");
if (working.length > 1) {
  const others = working.filter((w) => w.host !== best.host).map((w) => w.host);
  if (others.length) {
    console.log("");
    console.log(`SMTP_HOST also accepts a fallback list, e.g. SMTP_HOST=${best.host},${others[0]}`);
  }
}
console.log("");
console.log("Re-run with --send to prove a real message reaches the recipient.");
