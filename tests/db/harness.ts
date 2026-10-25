/**
 * Database test harness. Creates a throwaway database on the server named by
 * POCKETPULSE_TEST_DB_URL (an admin connection, e.g. postgres://postgres@127.0.0.1:5432/postgres),
 * applies tests/db/supabase-shim.sql + every supabase/migrations file in order, and drops the
 * database afterwards. Never point this at a hosted Supabase project.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

// Keep `date` columns as "YYYY-MM-DD" strings (no local-timezone Date conversion).
pg.types.setTypeParser(1082, (value) => value);

export const ADMIN_URL = process.env.POCKETPULSE_TEST_DB_URL;
export const SKIP_REASON =
  "POCKETPULSE_TEST_DB_URL is not set — database tests skipped (see README › Database tests).";

const ROOT = process.cwd();

export interface TestDb {
  client: pg.Client;
  name: string;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  if (!ADMIN_URL) throw new Error(SKIP_REASON);
  const name = `pocketpulse_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query("set timezone = 'UTC'");

  const { rows } = await client.query("select to_regnamespace('auth') is not null as has_auth");
  if (!rows[0].has_auth) {
    await client.query(readFileSync(join(ROOT, "tests", "db", "supabase-shim.sql"), "utf8"));
  }
  const migrationsDir = join(ROOT, "supabase", "migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await client.query(readFileSync(join(migrationsDir, file), "utf8"));
  }

  return {
    client,
    name,
    async close() {
      await client.end();
      const cleanup = new pg.Client({ connectionString: ADMIN_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

export async function createUser(db: TestDb, id: string, email: string) {
  await db.client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

export type Query = <R extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<pg.QueryResult<R>>;

export interface Session {
  q: Query;
  /** Runs a statement inside a savepoint and returns its error (or null), keeping the session usable. */
  error: (
    text: string,
    params?: unknown[],
  ) => Promise<(Error & { code?: string; detail?: string }) | null>;
  /** Calls an RPC returning jsonb. */
  rpc: <T = Record<string, unknown>>(fn: string, args: unknown[]) => Promise<T>;
}

/**
 * Runs `fn` as a Supabase API role inside a transaction that is always rolled back, so tests
 * never leak rows into each other. `userId` null = anonymous.
 */
export async function as<T>(
  db: TestDb,
  userId: string | null,
  fn: (session: Session) => Promise<T>,
): Promise<T> {
  const { client } = db;
  await client.query("begin");
  try {
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" }),
    ]);
    const q: Query = (text, params) => client.query(text, params);
    let n = 0;
    const session: Session = {
      q,
      async error(text, params) {
        const sp = `sp_${n++}`;
        await client.query(`savepoint ${sp}`);
        try {
          await client.query(text, params);
          await client.query(`release savepoint ${sp}`);
          return null;
        } catch (e) {
          await client.query(`rollback to savepoint ${sp}`);
          return e as Error & { code?: string };
        }
      },
      async rpc(fn, args) {
        const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
        const { rows } = await client.query(`select public.${fn}(${placeholders}) as r`, args);
        return rows[0].r;
      },
    };
    return await fn(session);
  } finally {
    await client.query("rollback");
  }
}
