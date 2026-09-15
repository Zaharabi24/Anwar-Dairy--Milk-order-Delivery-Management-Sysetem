# Anwar Fresh — Milk Ordering System

Internal employee milk ordering platform for Anwar Agro Farms, Anwar Group of Industries.

## Stack
- TanStack Start (SSR) + Vite + React + TypeScript
- Tailwind + shadcn/ui
- Bun: `bun.lock` is the lockfile, never use npm
- PostgreSQL 17 through the `postgres` driver, with plain SQL migrations. No Supabase
- Email: Microsoft Graph, or SMTP (Mailpit locally)
- Docker Compose, deployed on Dokploy behind Traefik

## Ports
| Service | Port |
| --- | --- |
| Vite dev server | 8080 |
| Production Node server | 3000 (`.output/server/index.mjs`) |
| PostgreSQL | 5432 |
| Mailpit inbox | 8025 (SMTP 1025) |

## Layout
- `src/server/`: server-only code; the build blocks client imports.
  - `db/`: connection, migrations, demo seed.
  - `auth/`: sessions, passwords, email, account console, staff invitations.
  - `app-data.server.ts`: orders, batches, collections and so on.
- `src/functions/*.functions.ts`: `createServerFn` RPC endpoints; they import server code
  inside handlers.
- `src/services/auth-service.ts`: every auth call from the UI goes through here.
- `src/context/app-data.tsx`: what the `/app` screens read and write.
- `src/lib/*.schemas.ts`: zod input validation shared by client and server.

## Roles (five) and portals
`employee` · `factory_operator` · `head_office_coordinator` · `system_admin` · `super_admin`

- **Employees:** Sign Up + approval, and sign in at `/login` with their Employee ID.
- **Staff:** invited by a Super Admin, and sign in at `/staff/admin` with their email.
- **Sessions:** a session only uses roles allowed by its portal (`rolesForPortal`).
- **Super Admin:** everything a System Admin can do, plus staff invitations and staff management.
- **System Admin:** manages employee accounts only.

## Rules
- Access control is enforced in `src/server/**` with `requirePermission` (map in
  `src/lib/permissions.ts`) on every call. Add permissions there; don't check role names in
  feature code. Route guards in `app.tsx` are UX only.
- Staff roles are granted only by accepting an invitation (`src/server/auth/invitations.server.ts`).
  Account requests grant the employee role only.
- Who is acting comes from the session, never from client input.
- Only `@anwargroup.net` emails may have accounts.
- Colours come from theme tokens only; never hardcode hex in components.
- Never restyle an existing page when adding functionality.
- Routing is file-based (TanStack Router). Never introduce react-router-dom.
- Anything touching `window`, `document` or `localStorage` must be guarded for SSR.
- Schema changes go in a new `src/server/db/migrations/NNNN_name.sql`. Never edit an applied one.

## Commands
```sh
docker compose up -d db mailpit   # local database + mail catcher
bun run dev                        # dev server on :8080 (settings in .env.local)
bunx tsc --noEmit                  # type check
bun run build                      # set NITRO_PRESET=node-server for a Node build
docker compose up -d --build       # full stack on :3000
docker compose down -v             # reset local database and emails
```

## Docs
`DEPLOYMENT.md` covers Docker, Dokploy, environment variables, demo accounts and how auth works.
