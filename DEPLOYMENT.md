# Deployment (Docker Compose / Dokploy)

The whole system runs as three containers:

| Service | Image | Purpose |
| --- | --- | --- |
| `web` | built from `Dockerfile` | TanStack Start SSR app, server functions and authentication — Node on port **3000** |
| `db` | `postgres:17-alpine` | PostgreSQL; data kept in the `db-data` volume |
| `mailpit` | `axllent/mailpit` | Test inbox that catches every email the app sends — web inbox on port **8025** |

There's no Supabase or other backend service. By default every email goes to Mailpit. To deliver
to real mailboxes, configure Microsoft Graph or an SMTP server instead.

| File | Purpose |
| --- | --- |
| `Dockerfile` | `bun install --frozen-lockfile` → `vite build` (`NITRO_PRESET=node-server`) → slim `node:24-alpine` runtime (non-root, healthcheck) |
| `docker-compose.yml` | What Dokploy deploys: `web` + `db` + `mailpit`, no host ports, no demo data |
| `docker-compose.override.yml` | Local only. Publishes ports (incl. Mailpit), turns demo data on. Dokploy runs `-f docker-compose.yml` and ignores it |
| `.env.example` | Settings for `bun run dev`. Copy to `.env.local` (gitignored, never read by compose) |

> **Why `NITRO_PRESET=node-server`:** `@lovable.dev/vite-tanstack-config` builds for
> Cloudflare Workers by default. Without it, `.output/server/index.mjs` isn't a Node server.

## Ports and URLs

| Context | App | Mail inbox | `APP_URL` |
| --- | --- | --- | --- |
| `bun run dev` | http://localhost:8080 | http://localhost:8025 | `http://localhost:8080` |
| `docker compose up` | http://localhost:3000 | http://localhost:8025 | `http://localhost:3000` (set by the override) |
| Dokploy | https://your-domain | — | `https://your-domain` |

`APP_URL` goes into every invitation, password setup and reset link. If it's unset, the app
uses the URL the request came in on. Set it explicitly in production.

## Run locally

Full stack in Docker:

```sh
docker compose up -d --build
```

- App: http://localhost:3000
- Emails: http://localhost:8025

Dev server:

```sh
cp .env.example .env.local
docker compose up -d db mailpit
bun install
bun run dev          # http://localhost:8080
```

### Demo accounts (demo data only)

Password for all of them: `Demo@12345`, or `DEMO_PASSWORD`.

| Sign in at | Identifier | Name | Roles |
| --- | --- | --- | --- |
| `/staff/admin` | `superadmin@anwargroup.net` | Rahima Chowdhury | Super Admin |
| `/staff/admin` | `farid.hasan@anwargroup.net` | Farid Hasan | System Admin (+ Employee) |
| `/staff/admin` | `sadia.rahman@anwargroup.net` | Sadia Rahman | System Admin (+ Employee) |
| `/staff/admin` | `nusrat.jahan@anwargroup.net` | Nusrat Jahan | Head Office Coordinator (+ Employee) |
| `/staff/admin` | `kamal.hossain@anwargroup.net` | Kamal Hossain | Factory Operator (+ Employee) |
| `/login` | `EMP-1006` | Ayesha Siddika | Employee |

People who hold an Employee role can also sign in at `/login` with their Employee ID
(e.g. `EMP-1002`); that session can only book milk.

Reset everything with `docker compose down -v`, which deletes the database and emails.

## Accounts, roles and access

### Two sign-in portals, one identity per person

| | Employee portal | Staff portal |
| --- | --- | --- |
| Who | Employees booking milk | Factory Operator, Head Office Coordinator, System Admin, Super Admin |
| Sign in | `/login`: Employee ID + password | `/staff/admin`: company email + password |
| Getting an account | `/signup` request, approved by a System Admin | Invitation from a Super Admin |
| Forgot password | `/forgot-password`: Employee ID + email + date of birth | `/staff/forgot-password`: email only, same response whether or not the account exists |

- **One account, one password.** A person has a single account (`employees` row) and password,
  whatever roles they hold.
- **Sessions are tied to a portal.** A session remembers which portal started it and can only use
  roles allowed there. An employee-portal session never has staff powers, even if that person is
  also a coordinator.
- **Role changes apply immediately.** Roles are re-read on every request, so a removed role stops
  working at once.

### Roles and permissions

Roles grant permissions in `src/lib/permissions.ts`. The server checks a permission on every call,
and the UI uses the same map to decide what to show.

| Role | Can |
| --- | --- |
| Employee | Book milk, request cancellations, see only their own orders |
| Factory Operator | Create and publish batches, view reports |
| Head Office Coordinator | Confirm/adjust orders, fulfillment, collections, reports |
| System Admin | All operator and coordinator work, plus approve employee account requests, manage **employee** accounts, roster, delivery points, settings, audit |
| Super Admin | Everything a System Admin can, plus **invite staff** and manage staff (change role, suspend, reset, remove access) |

Management reach:
- **System Admin:** manages employee-only accounts.
- **Super Admin:** manages every account except other Super Admins.
- **Nobody** can act on their own account.

### Staff invitation lifecycle

1. The Super Admin opens **Team & invitations → Invite member**. They enter an email
   (`@anwargroup.net`), a role, and optionally a name and Employee ID.
2. The app creates a single-use token (256 random bits); only its SHA-256 is stored. The link
   expires after `INVITE_TTL_HOURS` (default 72), and each email can have one pending invitation.
3. The invitee opens `/accept-invite?token=…`. Opening the link only checks it, so mail scanners
   can't use it up.
   - **New person:** sets their name and password. An account is created with a staff ID
     (`STF-0001`…) unless an Employee ID was given.
   - **Existing employee:** confirms their current password, and the role is added to that same
     account.
4. Accepting happens in one transaction:
   - the token is used up and other pending invitations for that email are revoked;
   - the role is granted and a staff session starts;
   - the inviter gets an email.
5. The Super Admin can **resend** or **copy invite link**. Both issue a new token, which kills the
   old link and restarts the expiry, and both also renew expired invitations. **Revoke** kills the
   link at once.
6. Later, from Members:
   - change role (among staff roles);
   - send password reset, suspend/reactivate, revoke sessions;
   - **remove staff access** (their employee account stays, or the account is deactivated if they
     had no employee role).

**Protections:**
- **Rate limits:** invitation sends (50/hour per admin), failed token lookups (30/hour per IP), and
  sign-ins (5 failures lock the email or ID for 15 minutes).
- **Links:** accept and reset pages send no referrer, so tokens don't leak.
- **Audit:** every step is recorded in **Account audit** (`invitation_created`, `invitation_resent`,
  `invitation_revoked`, `invitation_accepted`, `staff_role_changed`, `staff_access_removed`, …).

### Sessions and passwords

- **Sessions:** an httpOnly, SameSite=Lax cookie holds a random token; only its SHA-256 is stored.
  Sessions last `SESSION_TTL_DAYS` (7).
- **Passwords:** scrypt hashes. Setup and reset links are single-use, stored hashed, and expire
  after 7 days (setup) or 30 minutes (reset). Setting a password signs out all other sessions.

### Code

| Path | Contents |
| --- | --- |
| `src/server/auth/` | Server logic: sessions, auth, invitations, mail |
| `src/functions/auth.functions.ts` | RPC endpoints |
| `src/services/auth-service.ts` | Client calls |
| `src/lib/permissions.ts` | Role → permission map |
| `src/server/db/migrations/0003_staff_invitations.sql` | Schema |

## Creating the first Super Admin (production)

There are no default accounts in production. While no active Super Admin exists, each app start:

- **with `SUPER_ADMIN_EMAIL` set** (recommended): sends that address a fresh Super Admin
  invitation and prints the link in the `web` logs (`[auth] No Super Admin yet. Invitation for …`).
  The previous bootstrap link stops working.
- **with `SUPER_ADMIN_PASSWORD` (12+ characters) also set**: creates the account directly, for
  servers without email. Remove the variable after first sign-in.

The Super Admin then invites System Admins and other staff from **Team & invitations**.

**Recovery:** if the Super Admin account is ever lost, restart with `SUPER_ADMIN_EMAIL` set and a
new invitation is issued. The legacy `BOOTSTRAP_ADMIN_*` variables still create a System Admin
directly, but new deployments shouldn't need them.

## How the database is managed

- **Migrations** live in `src/server/db/migrations/` and are bundled into the app. On first request
  after start, the app takes a Postgres advisory lock and applies pending migrations. The container
  healthcheck triggers this right after boot.
- **Adding a migration:** add `0004_<name>.sql`. Never edit an applied one.
- **Demo data:** `SEED_DEMO_DATA=true` loads demo employees, batches, orders and the demo accounts
  above into an empty database. It's off by default in `docker-compose.yml`.

## Deploy on Dokploy

1. Push the repo to GitHub, GitLab or Gitea.
2. In Dokploy: **Create Service → Compose**, type **Docker Compose**.
3. **Provider:** pick the repo and branch. **Compose Path:** `./docker-compose.yml`.
4. **Environment** tab: at minimum set `POSTGRES_PASSWORD`, `APP_URL`, `SUPER_ADMIN_EMAIL`
   (+ `SUPER_ADMIN_NAME`) and `MAILPIT_UI_AUTH` (`username:password` for the inbox). Leave the
   `SMTP_*`, `MS_*` and `MAIL_CAPTURE` variables unset so email goes to Mailpit.
5. Click **Deploy**.
6. **Domains** tab: add a domain with service `web`, container port `3000`, HTTPS on with
   Let's Encrypt. Add a second domain with service `mailpit`, container port `8025` for the
   inbox. Redeploy so the routing applies.
7. Open the invitation email (or copy the link from the `web` logs) and accept it. You're signed in
   as Super Admin; invite your team from **Team & invitations**.

The `db-data` volume persists across redeploys. Back it up with Dokploy's volume backups, or run
`docker exec <db-container> pg_dump -U anwar anwar_fresh > backup.sql`.

### Troubleshooting

**`db` logs: "Database is uninitialized and superuser password is not specified"**, repeating as
the container restarts. `POSTGRES_PASSWORD` isn't set in the **Environment** tab. Dokploy deploys
only `docker-compose.yml`, which has no default password (the local one lives in
`docker-compose.override.yml`). Set it (letters, digits, `-`, `_` only), save and redeploy.

Postgres keeps the password from its first successful start. Changing `POSTGRES_PASSWORD` later
doesn't change it in an existing `db-data` volume, and `web` then fails to connect. Either change
it inside the database (`ALTER USER anwar PASSWORD '...'`) to match, or remove the volume if it
holds no data.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | — | **Required.** URL-safe characters only (letters, digits, `-`, `_`) |
| `POSTGRES_USER` / `POSTGRES_DB` | `anwar` / `anwar_fresh` | |
| `APP_URL` | request URL | Base for email links, e.g. `https://fresh.anwargroup.net` |
| `SUPER_ADMIN_EMAIL` | — | First Super Admin (must be `@anwargroup.net`); see above |
| `SUPER_ADMIN_NAME` | `Super Admin` | Pre-fills the invitation |
| `SUPER_ADMIN_EMPLOYEE_ID` | auto `STF-nnnn` | Optional |
| `SUPER_ADMIN_PASSWORD` | — | Optional, 12+ chars: create directly instead of inviting |
| `INVITE_TTL_HOURS` | `72` | How long staff invitation links stay valid |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SENDER_MAILBOX` | — | Microsoft Graph email. The app registration needs `Mail.Send` with admin consent |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | `mailpit`, `1025`, —, —, `false` | SMTP email, used when Graph isn't configured. Defaults point at the bundled Mailpit |
| `MAIL_CAPTURE` | `true` | `true` while email goes to Mailpit. Set `false` with a real SMTP provider |
| `MAILPIT_UI_AUTH` | — | `username:password` sign-in for the Mailpit inbox. **Set it** — the inbox shows invitation and password links |
| `MAIL_FROM` | `no-reply@anwargroup.net` | From address for SMTP |
| `SEED_DEMO_DATA` | `false` | **Keep `false` in production.** Demo accounts share a known password |
| `DEMO_PASSWORD` | `Demo@12345` | Only used with demo data |
| `SESSION_TTL_DAYS` | `7` | |
| `COOKIE_SECURE` | auto | Detected from `X-Forwarded-Proto`. Force with `true` or `false` |
| `TZ` | `Asia/Dhaka` | Server-rendered times match the browser |
| `DATABASE_POOL_MAX` | `10` | |
| `BOOTSTRAP_ADMIN_*` | — | Legacy direct System Admin creation |

With no email transport configured, messages aren't delivered. They're recorded in `email_outbox`
and their links are printed in the `web` logs. The Team page warns when an invitation couldn't be
emailed and offers "Copy invite link".

## Email delivery

Invitations, account-approval (password setup), password reset and admin notification emails all
go through `src/server/auth/mail.server.ts`. The transport is picked from the environment:

| Transport | Variables | Use for |
| --- | --- | --- |
| Microsoft Graph | `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SENDER_MAILBOX` | Microsoft 365 mailboxes (recommended for `@anwargroup.net`) |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, `MAIL_FROM` | Microsoft 365 SMTP, Google Workspace, SendGrid, Brevo, … |
| Test inbox | `SMTP_HOST` + `MAIL_CAPTURE=true` | Local development with Mailpit; **nothing reaches real mailboxes** |

> **Local development captures email.** `.env.local` and `docker-compose.override.yml` point email
> at Mailpit (`MAIL_CAPTURE=true`). Invitations and approval emails appear at
> http://localhost:8025 and are **not** delivered to the person's real inbox. To send real email
> locally, replace the Mailpit lines in `.env.local` with one of the real options, then restart
> `bun run dev`.

### Microsoft 365 setup

- **Graph (preferred):**
  1. In Entra ID, register an app and add the **Mail.Send** *application* permission.
  2. Grant admin consent and create a client secret.
  3. Set the four `MS_*` variables, with `MS_SENDER_MAILBOX` as an existing mailbox such as
     `no-reply@anwargroup.net`.
  4. Optionally, use an Application Access Policy to limit the app to that mailbox.
- **SMTP:**
  1. Set `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, `SMTP_REQUIRE_TLS=true`.
  2. Set `SMTP_USER`/`MAIL_FROM` to the sending mailbox and `SMTP_PASS` to its password.
  3. **Authenticated SMTP** must be enabled for that mailbox (Microsoft 365 admin → user → Mail →
     Email apps). Tenants with Security Defaults block it; use Graph instead.

### Checking that it works

- **Send test email:** the button on **Team & invitations** or **Account requests** sends a test to
  your own address and shows the result and transport:
  - "was sent to …" means the provider accepted it;
  - "caught by the local test inbox" means Mailpit;
  - "couldn't be emailed: …" gives the reason.
- **Startup log:**
  - `[mail] ready: …` means the connection and credentials work;
  - `[mail] local test inbox …` means capture mode;
  - `[mail] NOT READY — …` gives the problem (bad password, unreachable host, …).
- **Screens:** inviting, resending, approving and sending setup/reset links now report the real
  outcome instead of always saying "sent".
- **Records:** every email is logged in `email_outbox` with status `sent`, `captured`, `logged` or
  `failed`, plus the error text.

If an email failed, fix the settings and use **Resend email** (Team page) or **Resend password
setup link** (Accounts). The invitation or approval itself is already saved.

## Pre-launch checklist

- [ ] `SEED_DEMO_DATA` is `false` (or unset) in Dokploy
- [ ] `POSTGRES_PASSWORD`, `APP_URL` and `SUPER_ADMIN_EMAIL` set; Super Admin invitation accepted
- [ ] `SUPER_ADMIN_PASSWORD` not left in the environment (if it was used)
- [ ] Email transport works (check `email_outbox` for `failed` rows)
- [ ] For Graph: Application Access Policy limits the app to the sender mailbox
- [ ] For Graph: Safe Links exclusion for the app domain
- [ ] At least one System Admin invited, to approve employee account requests
- [ ] Database backups scheduled
