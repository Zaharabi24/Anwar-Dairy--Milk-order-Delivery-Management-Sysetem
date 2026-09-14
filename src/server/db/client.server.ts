// PostgreSQL connection for server code only. The first call runs pending
// migrations (and the optional demo seed) before handing out the pool.
import postgres from "postgres";
import { bootstrapAdmin, seedDemoAccounts, seedDemoData, seedDemoSuperAdmin } from "./seed.server";
import { bootstrapSuperAdmin } from "../auth/invitations.server";
import { sendMail, verifyMailTransport, type MailMessage } from "../auth/mail.server";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const migrations = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Arbitrary constant shared by every app instance so only one migrates at a time.
const MIGRATION_LOCK_ID = 4_217_001;

let ready: Promise<Sql> | undefined;

export function getDb(): Promise<Sql> {
  ready ??= connect()
    .then(({ sql, startupMail }) => {
      // Sent once the pool is ready (sendMail itself uses getDb, so it can't run inside connect).
      for (const mail of startupMail) queueMicrotask(() => void sendMail(mail));
      // Say at boot whether email will really reach people, instead of finding out from users.
      queueMicrotask(() => {
        void verifyMailTransport().then((check) => {
          if (check.ok && check.kind === "capture") {
            console.warn(`[mail] ${check.description}. Emails will appear in Mailpit only.`);
          } else if (check.ok) {
            console.info(`[mail] ready: ${check.description}`);
          } else {
            console.error(
              `[mail] NOT READY — ${check.description}${check.error ? `: ${check.error}` : ""}`,
            );
          }
        });
      });
      return sql;
    })
    .catch((error: unknown) => {
      ready = undefined; // let the next request retry, e.g. while the database boots
      throw error;
    });
  return ready;
}

function loadDevEnv() {
  if (process.env["NODE_ENV"] === "production") return;
  // The dev server doesn't reliably expose .env files to server code. Existing variables win.
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file absent — try the next one
    }
  }
}

function databaseUrl(): string {
  loadDevEnv();
  const url = process.env["DATABASE_URL"];
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Example: postgres://user:pass@localhost:5432/anwar_fresh",
    );
  }
  return url;
}

async function connect(): Promise<{ sql: Sql; startupMail: MailMessage[] }> {
  const sql = postgres(databaseUrl(), {
    max: Number(process.env["DATABASE_POOL_MAX"] ?? 10),
    onnotice: () => {},
  });
  const startupMail: MailMessage[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`;
      await tx`
        create table if not exists schema_migrations (
          name text primary key,
          applied_at timestamptz not null default now()
        )`;
      const applied = new Set(
        (await tx<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
      );
      for (const [path, content] of Object.entries(migrations).sort(([a], [b]) =>
        a.localeCompare(b),
      )) {
        const name = path.slice(path.lastIndexOf("/") + 1);
        if (applied.has(name)) continue;
        await tx.unsafe(content);
        await tx`insert into schema_migrations (name) values (${name})`;
        console.info(`[db] applied migration ${name}`);
      }
      // Demo data (and demo sign-in accounts with a shared password) only when explicitly enabled.
      if (process.env["SEED_DEMO_DATA"] === "true") {
        if (!applied.has("seed:demo-data")) {
          const seeded = await seedDemoData(tx);
          await tx`insert into schema_migrations (name) values ('seed:demo-data')`;
          if (seeded) console.info("[db] seeded demo data");
        }
        if (!applied.has("seed:demo-accounts")) {
          await seedDemoAccounts(tx);
          await tx`insert into schema_migrations (name) values ('seed:demo-accounts')`;
          console.info("[db] seeded demo sign-in accounts (password from DEMO_PASSWORD)");
        }
        if (!applied.has("seed:demo-super-admin")) {
          await seedDemoSuperAdmin(tx);
          await tx`insert into schema_migrations (name) values ('seed:demo-super-admin')`;
          console.info("[db] seeded demo Super Admin (superadmin@anwargroup.net)");
        }
      }
      // Legacy: BOOTSTRAP_ADMIN_* still creates a System Admin directly.
      if (await bootstrapAdmin(tx)) console.info("[db] created bootstrap System Admin");
      const superAdminInvite = await bootstrapSuperAdmin(tx);
      if (superAdminInvite) startupMail.push(superAdminInvite);
    });
  } catch (error) {
    await sql.end({ timeout: 5 }).catch(() => {});
    throw error;
  }
  return { sql, startupMail };
}
