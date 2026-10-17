# Deployment (Docker Compose / Dokploy)

The app stack is three containers, and the database is deliberately **not** one of them:

| Service | Image | Purpose |
| --- | --- | --- |
| `web` | built from `Dockerfile` | TanStack Start SSR app, server functions and authentication — Node on port **3000** |
| `redis` | `redis:7-alpine` | Batch mail queue; data kept in the `redis-data` volume |
| `mailpit` | `axllent/mailpit` | Test inbox that catches every email the app sends — web inbox on port **8025** |

PostgreSQL runs separately — in production as its own Dokploy **Database** service (today the
`anwar-agro` database), locally as a throwaway container from `docker-compose.override.yml` — and
`web` reaches it through `DATABASE_URL`. See [The database](#the-database). There's no Supabase
or other backend service. By default every email goes to Mailpit. To deliver to real mailboxes,
configure Microsoft Graph or an SMTP server instead.

| File | Purpose |
| --- | --- |
| `Dockerfile` | `bun install --frozen-lockfile` → `vite build` (`NITRO_PRESET=node-server`) → slim `node:24-alpine` runtime (non-root, healthcheck) |
| `docker-compose.yml` | What Dokploy deploys: `web` + `redis` + `mailpit`, no database, no host ports, no demo data |
| `docker-compose.override.yml` | Local only. Adds a `db` Postgres container, publishes ports (incl. Mailpit), turns demo data on. Dokploy runs `-f docker-compose.yml` and ignores it |
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

### The Employee Database, October 2026

`0031_employee_directory_october_2026.sql` imports the 530 people in
`AGI ALL Employee Data - October 2026.xlsx` (sheet "AGI ALL Employee Data - HQ"). It updates the
358 already on file and adds the rest, and it brings three things the older file (migration `0009`)
did not:

| Column in the file | Stored in | Notes |
| --- | --- | --- |
| Company Unit | `employees.company_unit` and `business_unit_code` | The units the group didn't have yet are added to `business_units`, so every screen that shows a business unit shows the real name |
| Location | `employees.site` | "Head Office" for everyone |
| Floor | `employees.floor_no` | |

Five people are imported inactive because they can't be mailed (four have no address on file, one
shares another's address) but stay in the directory; a System Admin can fix the address and switch
them back on. The file's own sheet "STF-0001" row is kept as given.

The migration runs automatically the first time the app connects to a database that doesn't have
it — the new `anwar-agro` database included, where it runs after `0009` and leaves one directory in
place. To *only* seed the directory of a fresh database, nothing else is needed.

### The database

`docker-compose.yml` starts no PostgreSQL. The database is a separate Dokploy service, so the app
can be rebuilt, redeployed or torn down without touching the data, and the data has its own
backups and lifecycle. `web` gets its connection from `DATABASE_URL`, which the compose file
assembles from the `POSTGRES_*` values when it isn't set outright:

```
postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}
```

| Variable | Default | |
| --- | --- | --- |
| `POSTGRES_HOST` | `anwar-organic-anwar-agro-db-vd9zl4` | The Dokploy database service's hostname |
| `POSTGRES_PORT` | `5432` | |
| `POSTGRES_USER` | `anwar_agro` | |
| `POSTGRES_PASSWORD` | — | **Required** unless `DATABASE_URL` is set. URL-safe characters only |
| `POSTGRES_DB` | `anwar-agro` | |

So the current production **Environment** tab

```
POSTGRES_DB=anwar-agro
POSTGRES_USER=anwar_agro
POSTGRES_PASSWORD=<the password set on the database service>
```

connects to `postgresql://anwar_agro:<password>@anwar-organic-anwar-agro-db-vd9zl4:5432/anwar-agro`.
Setting `DATABASE_URL` itself overrides all of that, for a managed Postgres or any other host.

On start the app applies every pending migration, including the October 2026 directory import
above, so an empty database comes up ready. Nothing in the environment of `web` can create or
reset the database itself.

**Network.** The hostname is the database container's name on Dokploy's shared `dokploy-network`.
Dokploy attaches compose services to that network when it deploys them, which is what lets `web`
resolve it. If the `web` log shows `getaddrinfo ENOTFOUND anwar-organic-anwar-agro-db-vd9zl4`,
the two services aren't on one network: in the compose service's **Advanced** settings make sure
the project is attached to `dokploy-network`, or add it to `web` explicitly:

```yaml
services:
  web:
    networks: [default, dokploy-network]
networks:
  dokploy-network:
    external: true
```

The name resolves only inside Docker on that host, so `bun run dev` on a laptop cannot use it;
develop against the local `db` container from `docker-compose.override.yml` instead.

**Password changes.** The password lives in the database service, not in this stack. Change it
there (Dokploy's database settings, or `ALTER USER anwar_agro PASSWORD '...'`) and update
`POSTGRES_PASSWORD` here in the same step, then redeploy `web`.

### Moving an existing database's data

To move the live data — employees and their accounts and roles, batches, orders, collections, and
the email and audit history — from another installation into a new database, take a full dump and
restore it, then let the app bring the schema up to date:

```sh
# 1. Dump the source (here: the Neon database the app ran on before).
pg_dump "<source-url>" -Fc --no-owner --no-privileges -f neon.dump

# 2. Restore into the new database (the credentials come from DATABASE_URL).
PGPASSWORD='<password>' pg_restore -h <host> -p 5432 -U anwar_agro -d anwar-agro \
  --no-owner --no-privileges neon.dump

# 3. Start the app. It applies every migration the source hadn't run yet -- including the
#    October 2026 Employee Database import (0031) and its cleanup (0032).
```

The restore carries `schema_migrations` across, so the app only runs the migrations the source was
missing and never re-runs one already applied. `user_roles` and `employees.account_status` come
with the data, so sign-in and role-based access keep working with no extra step.

#### From a plain SQL dump (`backups/*.sql`)

The local dumps in `backups/` and `DB Backup/` are plain `pg_dump` SQL, made as user `anwar`.
Every table in them carries `OWNER TO anwar`, a role the new database doesn't have, so strip those
lines first (and the `\restrict` guards, which only psql 17.6+ understands):

```sh
grep -v -E '^ALTER (TABLE|SEQUENCE|TYPE|FUNCTION|VIEW|SCHEMA) .* OWNER TO anwar;$|^\\(un)?restrict ' \
  backups/backup.sql > backups/restore-anwar-agro.sql
```

The database host resolves only inside Docker on the Dokploy server, so run the restore there.
Copy the file up, then feed it to `psql` inside the database container; the target must be
**empty** (a freshly created database, or one you've dropped and recreated), because the dump
creates every table:

```sh
scp backups/restore-anwar-agro.sql <server>:/tmp/
ssh <server>
docker ps --filter name=anwar-agro-db --format '{{.Names}}'          # the database container
docker exec -i <container> psql -v ON_ERROR_STOP=1 -q -U anwar_agro -d anwar-agro \
  < /tmp/restore-anwar-agro.sql
docker exec <container> psql -U anwar_agro -d anwar-agro -c 'select count(*) from employees'
rm /tmp/restore-anwar-agro.sql
```

Alternatively, give the database service an **external port** in Dokploy and run the same `psql`
from your machine with `-h <server> -p <port>`; remove the port again afterwards.

Then redeploy `web`. If the dump is as new as the code, the log shows no `[db] applied migration`
lines and the home page answers at once. Checked on 2026-10-17 with `backups/backup.sql`
(32 migrations, 546 employees, 86 orders) into both Postgres 17 and 18: the restore runs clean with `ON_ERROR_STOP`, every
table ends up owned by `anwar_agro`, and the app starts with nothing pending.

## Deploy on Dokploy

1. Push the repo to GitHub, GitLab or Gitea.
2. **The database first.** In Dokploy: **Create Service → Database → PostgreSQL** (17 or 18; production runs 18),
   with the database name, user and password you'll give the app. Deploy it and note the
   hostname Dokploy shows for it (for the current installation that is
   `anwar-organic-anwar-agro-db-vd9zl4`). Skip this if the database already exists.
3. **Create Service → Compose**, type **Docker Compose**.
4. **Provider:** pick the repo and branch. **Compose Path:** `./docker-compose.yml`.
5. **Environment** tab: set `POSTGRES_PASSWORD` (plus `POSTGRES_HOST`, `POSTGRES_USER` and
   `POSTGRES_DB` if they differ from the defaults in [The database](#the-database)), `APP_URL`,
   `SUPER_ADMIN_EMAIL` (+ `SUPER_ADMIN_NAME`) and `MAILPIT_UI_AUTH` (`username:password` for the
   inbox). **Email:** with the `SMTP_*` and `MS_*` variables unset, every message goes to the
   bundled Mailpit inbox and nobody receives anything -- fine for a trial, not for a working
   system. For real delivery set the four `MS_*` variables (Microsoft Graph) or `SMTP_HOST`,
   `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` (SMTP) -- see
   [Email delivery](#email-delivery). The Publish screen warns while mail is still going to Mailpit.
6. Click **Deploy**.
7. **Domains** tab: add a domain with service `web`, container port `3000`, HTTPS on with
   Let's Encrypt. Add a second domain with service `mailpit`, container port `8025` for the
   inbox. Redeploy so the routing applies.
8. Open the invitation email (or copy the link from the `web` logs) and accept it. You're signed in
   as Super Admin; invite your team from **Team & invitations**.

The data lives in the database service's own volume and is untouched by redeploys of this stack.
Back it up from that service (Dokploy's database backups to S3, or
`docker exec <db-container> pg_dump -U anwar_agro anwar-agro > backup.sql`).

### Troubleshooting

**`web` logs: `ECONNREFUSED` or `getaddrinfo ENOTFOUND <host>` on start**, and the home page
answers 500. The app can't reach the database. Check, in order: the database service is running
in Dokploy; `POSTGRES_HOST` (or the host in `DATABASE_URL`) is its current hostname; both
services are on `dokploy-network` — see [The database](#the-database).

**`web` logs: `password authentication failed for user "anwar_agro"`**. `POSTGRES_PASSWORD` in
the **Environment** tab doesn't match the database. There is no `db` container in this stack any
more, so the compose file never sets a password: change it in the database service, or correct the
variable, and redeploy `web`.

**A batch was published, but nobody received the email.** Open **Publish records** (operator) or
**Email records** (System Admin) and read the status against the messages:

- **Captured locally** -- the server is sending to its own Mailpit test inbox, which keeps mail
  rather than delivering it. This is the default of a fresh deployment: no `MS_*` or `SMTP_*`
  variables are set in the Dokploy **Environment** tab, so `SMTP_HOST` fell back to the bundled
  Mailpit. The messages are in the Mailpit inbox (its domain in Dokploy). Set a real transport --
  the four `MS_*` variables, or `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM` -- and redeploy. The Publish screen shows a warning for as long as this is the case.
  A redeploy does not resend what was captured: publish again, or use **Send the rest** / **Resend**
  from Publish records once the new settings are in.
- **Send failed** with an error naming `APP_URL` -- the queue could not build the booking link
  because `APP_URL` is unset and the mail is sent outside any web request. Set `APP_URL` (with the
  scheme, e.g. `https://agro.a1polymer.net`), redeploy, and the remaining attempts go through on
  their own; use **Resend** for anything already marked failed.
- **Send failed** with a mail-server error (`535`, `421 4.4.2`, `ECONNREFUSED`, a certificate) --
  see the `[mail] NOT READY` / `[mail] delivery ... failed` lines in the `web` log and
  [Email delivery](#email-delivery). The rate-limit case is covered in
  [The batch mail queue](#the-batch-mail-queue).
- **Queued** for more than a few minutes with nothing moving -- the `redis` service is down or
  `REDIS_URL` points at the wrong host. The `web` log says `[mail] queue unreachable, sending
  in-process instead`; opening Publish records puts the messages back on their way either way.
- **No recipients** -- nobody in the Employee Database is active with an address and the employee
  role; check the directory, or the batch's chosen recipients.

The quickest end-to-end check is **Accounts → Send test email** as a System Admin: it reports the
transport in use and whether the message was delivered, captured or failed.

## Environment variables

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | assembled from `POSTGRES_*` | The external PostgreSQL. Set it outright for a managed database, or set the `POSTGRES_*` values below — see [The database](#the-database) |
| `POSTGRES_PASSWORD` | — | **Required** unless `DATABASE_URL` is set. URL-safe characters only (letters, digits, `-`, `_`) |
| `POSTGRES_HOST` / `POSTGRES_PORT` | `anwar-organic-anwar-agro-db-vd9zl4` / `5432` | The Dokploy database service's hostname |
| `POSTGRES_USER` / `POSTGRES_DB` | `anwar_agro` / `anwar-agro` | |
| `APP_URL` | request URL | Base for email links, e.g. `https://agro.a1polymer.net`. **Set it in production:** booking emails go out from the mail queue, where there is no request to read the address from |
| `SUPER_ADMIN_EMAIL` | — | First Super Admin (must be `@anwargroup.net`); see above |
| `SUPER_ADMIN_NAME` | `Super Admin` | Pre-fills the invitation |
| `SUPER_ADMIN_EMPLOYEE_ID` | auto `STF-nnnn` | Optional |
| `SUPER_ADMIN_PASSWORD` | — | Optional, 12+ chars: create directly instead of inviting |
| `INVITE_TTL_HOURS` | `72` | How long staff invitation links stay valid |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_SENDER_MAILBOX` | — | Microsoft Graph email. The app registration needs `Mail.Send` with admin consent |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | `mailpit`, `1025`, —, —, `false` | SMTP email, used when Graph isn't configured. Defaults point at the bundled Mailpit. `SMTP_HOST` accepts a comma-separated list of mail servers — see [Several mail servers](#several-mail-servers) |
| `MAIL_CAPTURE` | by host | `true` = the SMTP server is a test inbox; messages are recorded as captured, never delivered. Unset, a host named after Mailpit counts as a test inbox and any other host as real, so it only needs setting to override that |
| `SMTP_REQUIRE_TLS` | `false` | `true` = refuse to send unless the server upgrades to TLS (STARTTLS) |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | `false` accepts a self-signed certificate. Only for an internal mail server such as on-premises Exchange |
| `SMTP_ANONYMOUS_FALLBACK` | `true` | `false` requires authentication and never relays without credentials — see [Several mail servers](#several-mail-servers) |
| `MAILPIT_UI_AUTH` | — | `username:password` sign-in for the Mailpit inbox. **Set it** — the inbox shows invitation and password links |
| `MAIL_FROM` | `no-reply@anwargroup.net` | From address for SMTP |
| `REDIS_URL` | `redis://redis:6379` | Batch mail queue — see [The batch mail queue](#the-batch-mail-queue). Unset it to send in-process instead |
| `MAIL_RATE_PER_MINUTE` | `25` | Messages a minute, across the whole app. Microsoft 365 refuses above 30 per account. An on-premises Exchange often allows fewer: if the log shows `421 4.4.2 ... submission rate`, set this below the server's limit (e.g. `5`) |
| `SEED_DEMO_DATA` | `false` | **Keep `false` in production.** Demo accounts share a known password |
| `DEMO_PASSWORD` | `Demo@12345` | Only used with demo data |
| `SESSION_TTL_DAYS` | `7` | Days of **inactivity** before a session lapses. Each request renews it, so someone using the app is never signed out mid-session. Leave it unset rather than blank — a blank value is ignored (with a warning in the log) and 7 is used |
| `COOKIE_SECURE` | auto | Detected from `X-Forwarded-Proto`. Force with `true` or `false` |
| `TZ` | `Asia/Dhaka` | Server-rendered times match the browser |
| `DATABASE_POOL_MAX` | `10` | |
| `BOOTSTRAP_ADMIN_*` | — | Legacy direct System Admin creation |

With no email transport configured, messages aren't delivered. They're recorded in `email_outbox`
and their links are printed in the `web` logs. The Team page warns when an invitation couldn't be
emailed and offers "Copy invite link".

## The batch mail queue

Publishing a batch emails everyone active in the Employee Database — around 360 people. That is
not a request's worth of work, for one reason that no amount of code can argue with: **Microsoft
365 accepts 30 client submissions a minute per account.** Above that it answers

```
421 4.4.2 Message submission rate for this client has exceeded the configured limit
```

and drops the connection, so a burst doesn't just lose one message, it loses the run. So the send
is paced at `MAIL_RATE_PER_MINUTE` (25, leaving room for password resets sharing the mailbox) and
a full directory takes about a quarter of an hour. That is the floor for any approach that goes
through 365; the queue is there to make the quarter of an hour reliable, not shorter.

How it works:

- Publishing writes one `batch_emails` row per recipient and answers immediately. Nothing is sent
  inside the request.
- A **BullMQ worker on Redis** sends them, one at a time, inside the rate limit. The limiter lives
  in Redis, so two app instances still send 25 a minute *between them*.
- A refusal that means "not now" (any 4xx, a dropped connection, a throttle) is retried up to five
  times with exponential backoff starting at 30 seconds. A refusal that means "no" fails once.
- The worker starts with the app, so a send interrupted by a restart or a redeploy carries on by
  itself. Opening **Publish Records** or **Email Records** also puts anything outstanding back on
  the queue, and Publish Records has a **Send the rest** button.
- Every message's outcome is on its own row, so **Email Records** shows exactly who was written
  to, when, and why anything hasn't arrived.

**Without `REDIS_URL`** the app still works: the same messages go out from the same queue table at
the same rate, sent in-process. What you lose is durability — a restart partway through stops that
run, and it resumes on the next publish or the next look at the records rather than immediately.
Redis is strongly preferred in production and is already in `docker-compose.yml`.

## The System Admin mailbox

**System Admin → Mailbox** writes to the Employee Database on the official template: everyone, or
a list the admin picks. It shares the batch queue, so both come out of the same 25-a-minute
allowance — a notice sent while a batch is going out does not push the mailbox over its limit.

Held by `mailbox.send`, which only the System Admin and the Super Admin have. The permission is
checked on every call, not just on the menu: a direct call to the server function from any other
role answers 403.

Safeguards against the mass email nobody meant to send:

- **All employees** and **Selected employees** are separate choices, not a checkbox that happens
  to be ticked, and the recipient count is on screen the whole time.
- Confirming says "You are about to send this email to X employees." A specific list is shown in
  full before sending; sending to everyone additionally requires typing `SEND`.
- The recipient list is resolved **server-side from the directory**, never taken from the browser.
  Someone inactive, deleted, or without an address cannot be reached even if their id is posted.
- The message is plain text and is escaped before rendering, so the company's branded template
  cannot be used to carry arbitrary markup.
- Nothing is sent without that confirmation, and every send writes an `audit_logs` entry.

**Email history** records each send with the date, subject, audience, recipient count and status,
and lists every recipient with their delivery status and the reason for any failure.

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

### Several mail servers

Each email is offered to a list of **routes** and goes out through the first that accepts it. A
route is one address paired with one authentication choice, and the list is built from three
things:

1. `SMTP_HOST`, which accepts a comma-separated list of servers;
2. **every address each name resolves to** — two Exchange servers commonly share one name, and
   only one of them may accept our mail, so failing over from the name to the same name would
   just reach the same pair;
3. **with `SMTP_USER` first, then without it** — an internal relay connector usually wants no
   credentials at all and answers `535` to the ones meant for the client connector. Set
   `SMTP_ANONYMOUS_FALLBACK=false` to require authentication and never fall back.

Authenticated routes are tried across every address before any anonymous one, so a server that
does accept the credentials is always preferred over relaying without them.

`SMTP_HOST` accepts a comma-separated list, which is what to use when the organisation has more
than one Exchange server:

```
SMTP_HOST=exchange02.corp.internal,exchange01.corp.internal
```

A route that refuses the connection, the TLS handshake, the credentials or the recipient is
skipped and the next is tried; only when all of them refuse does the message count as failed, and
the error then names what each one said. The route that last delivered is tried first, so a
refusing server isn't dialled again for every message. All hosts share `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS` and the TLS settings, so list servers that take the same credentials.

### `535 5.7.3 Authentication unsuccessful` from one server only

This client can speak `LOGIN`, `PLAIN`, `CRAM-MD5` and `XOAUTH2`. An Exchange server whose EHLO
offers only `NTLM` or `GSSAPI` — the internal server-to-server connector, usually alongside
`X-ANONYMOUSTLS`, `X-EXPS` and `XRDST` — still advertises `AUTH`, so a login is attempted and
refused with `535` no matter how correct the password is. When two servers share a name and only
one of them is like this, delivery looks intermittent. `scripts/mail-probe.mjs` prints each
server's `AUTH` line and says which mechanisms are unusable; point `SMTP_HOST` at the server that
offers `AUTH LOGIN`, or let the route list find it.

> **A passing startup check is not proof of delivery.** `verify()` stops once the server has
> accepted the connection, TLS and the credentials — it never offers a recipient. A connector that
> takes an anonymous connection but refuses to relay therefore still logs `[mail] ready`, and only
> a real send reveals it. That is what the route list is for, and why `--send` exists in the probe.

Because a host is skipped only after it refuses, a server that accepts a message but never
acknowledges it (a timeout part-way through) can lead to the same email arriving twice. That is
the intended trade for password-setup and invitation links.

**Which server works?** `scripts/mail-probe.mjs` tries every host, port and auth mode and reports
how far each one got, then prints the variables to set:

```sh
node scripts/mail-probe.mjs \
  --hosts exchange01.corp.internal,exchange02.corp.internal \
  --user 'DOMAIN\svc-mailer' --pass 'secret' \
  --to you@anwargroup.net
```

It resolves each name to every address, prints the server name and `AUTH` line for each, and
stops after the credentials are accepted — nothing is sent. Add `--send` to deliver a real test
message, and `--no-require-tls` for a server with no STARTTLS. Run it from a machine on the same
network as the mail servers — the Dokploy host is ideal, since that is where the app runs.

### Checking that it works

- **Send a real invitation** to your own address from **Team & invitations**. The page says when
  one couldn't be emailed and offers "Copy invite link", so a failure is visible rather than
  silent.
- **Email Records** (System Admin) is the fullest picture: every batch email with its delivery
  status and, where it failed, the reason the mail server gave.
- **Startup log:**
  - `[mail] ready: …` names the route email will leave by, and lists any route that isn't usable
    with the reason — this is the quickest way to see which Exchange server is answering. It is a
    connection check, not proof that the server will relay (see above);
  - `[mail] sending through …` means delivery moved to another route in the list;
  - `[mail] local test inbox …` means capture mode;
  - `[mail] NOT READY — …` gives the problem (bad password, unreachable host, …).
- **Screens:** inviting, resending, approving and sending setup/reset links now report the real
  outcome instead of always saying "sent".
- **Records:** every email is logged in `email_outbox` with status `sent`, `captured`, `logged` or
  `failed`, plus the error text.

If an email failed, fix the settings and use **Resend email** (Team page) or **Resend password
setup link** (Accounts). The invitation or approval itself is already saved.

## Production environment checklist

The settings that most often go wrong on a fresh deployment, and what each must be.

### Database

- [ ] The database is its **own Dokploy service**; `docker-compose.yml` never starts one. Point
  the app at it in one of two ways, not both:
  - `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (the host defaults to
    the `anwar-agro` service), with `DATABASE_URL` unset; or
  - `DATABASE_URL` outright (the `POSTGRES_*` values are then unused).
- [ ] The `POSTGRES_*` values here only tell the app where to connect. They don't create or
  change anything in the database service: a new user, database or password is set up there.
- [ ] `POSTGRES_PASSWORD` uses URL-safe characters only (letters, digits, `-`, `_`): it is
  interpolated into the connection URL.
- [ ] `web` and the database are on the same Docker network (`dokploy-network`); otherwise the
  hostname doesn't resolve.
- [ ] Migrations apply themselves on first start; watch the `web` log for `[db] applied migration`.

### First Super Admin

- [ ] `SUPER_ADMIN_EMAIL` must be an `@anwargroup.net` address.
- [ ] The bootstrap acts **only while no active Super Admin exists**. On a database restored from
  another installation, that account already exists, so `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`
  do nothing — sign in with the existing password, or clear the account first.
- [ ] Remove `SUPER_ADMIN_PASSWORD` from the environment once you are signed in.

### Links and cookies

- [ ] `APP_URL` **includes the scheme**: `https://agro.a1polymer.net`, not `agro.a1polymer.net`.
  Every invitation, password-setup, reset and booking link is built from it, and a missing scheme
  makes them unopenable; it also decides whether the session cookie is marked `Secure`.
- [ ] A DNS record and a Dokploy domain (service `web`, port `3000`, HTTPS on) exist for the host
  in `APP_URL`.

### Email

- [ ] A real transport is configured: the four `MS_*` variables, or `SMTP_HOST` naming the mail
  server (with `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`). Unset, mail goes to the bundled
  Mailpit and is never delivered; the Publish screen warns while that is so.
- [ ] `MAIL_CAPTURE` is unset or `false` -- `true` records every message as captured.
- [ ] `SMTP_REQUIRE_TLS=true` needs the server to offer STARTTLS. On port 25 many relays do not;
  check with `node scripts/mail-probe.mjs --hosts <ip> --ports 25`.
- [ ] `MAIL_FROM` is an address the authenticated account (`SMTP_USER`) is allowed to send as, or
  the server answers "not allowed to send as".
- [ ] `MAIL_RATE_PER_MINUTE` is within what the server allows — an internal Exchange often allows
  far fewer than Microsoft 365. Publishing to the whole directory takes about
  `recipients ÷ MAIL_RATE_PER_MINUTE` minutes.
- [ ] Send one real invitation to yourself and confirm it arrives.
- [ ] For Graph: Application Access Policy limits the app to the sender mailbox, and Safe Links is
  excluded for the app domain.

### Safety

- [ ] `SEED_DEMO_DATA` is `false` (or unset) in production.
- [ ] Rotate any password that has been shared outside the server, and keep secrets out of git.
- [ ] At least one System Admin invited, to approve employee account requests.
- [ ] Database backups scheduled.
