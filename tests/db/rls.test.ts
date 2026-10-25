import {
  A,
  A_CASH,
  A_GOAL,
  B,
  B_CASH,
  type Fixtures,
  expenseJson,
  seedFixtures,
  tid,
} from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type TestDb, as, createTestDb } from "./harness";

const PRIVATE_TABLES = [
  "profiles",
  "accounts",
  "categories",
  "category_rules",
  "savings_goals",
  "recurring_templates",
  "transactions",
  "commitments",
  "budgets",
  "quick_add_presets",
  "notification_preferences",
  "notifications",
  "xp_events",
  "user_achievements",
  "user_quests",
  "streak_state",
  "sync_operations",
  "sync_devices",
];

describe.skipIf(!ADMIN_URL)("row level security", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
    // One committed row per user to look for across the boundary.
    await db.client.query(
      `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id, category_id)
       values ($1, $2, 'expense', 1500, now(), $3, $4), ($5, $6, 'expense', 2500, now(), $7, $8)`,
      [tid(1), A, A_CASH, f.aFood, tid(2), B, B_CASH, f.bFood],
    );
  });
  afterAll(async () => {
    await db?.close();
  });

  it("is enabled on every table in the public schema", async () => {
    const { rows } = await db.client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(rows).toEqual([]);
    const { rows: all } = await db.client.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(all.map((r) => r.relname).sort()).toEqual(
      [...PRIVATE_TABLES, "achievements", "quests"].sort(),
    );
  });

  it("gives anonymous callers no access to any private table or RPC", async () => {
    await as(db, null, async (s) => {
      for (const table of PRIVATE_TABLES) {
        const err = await s.error(`select * from public.${table}`);
        expect(err?.message, table).toMatch(/permission denied/);
      }
      expect((await s.error("select public.create_transaction('{}'::jsonb)"))?.message).toMatch(
        /permission denied/,
      );
      expect((await s.error("select public.ensure_my_defaults()"))?.message).toMatch(
        /permission denied/,
      );
    });
  });

  it("only shows each user their own rows", async () => {
    await as(db, B, async (s) => {
      for (const table of PRIVATE_TABLES) {
        const ownerColumn = table === "profiles" ? "id" : "owner_id";
        const { rows } = await s.q(
          `select count(*)::int as n from public.${table} where ${ownerColumn} <> $1`,
          [B],
        );
        expect(rows[0]!.n, table).toBe(0);
      }
      const { rows } = await s.q("select id from public.transactions");
      expect(rows.map((r) => r.id)).toEqual([tid(2)]);
      expect((await s.q("select * from public.profiles")).rows).toHaveLength(1);
    });
  });

  it("rejects writes that claim another user's owner_id", async () => {
    await as(db, B, async (s) => {
      const err = await s.error(
        `insert into public.accounts (owner_id, name, opening_balance_date) values ($1, 'Sneaky', '2026-10-01')`,
        [A],
      );
      expect(err?.message).toMatch(/row-level security/);
      const txErr = await s.error(
        `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id)
         values ($1, $2, 'expense', 100, now(), $3)`,
        [tid(10), A, A_CASH],
      );
      expect(txErr?.message).toMatch(/row-level security/);
    });
  });

  it("can't update, delete or re-own another user's rows", async () => {
    await as(db, B, async (s) => {
      expect(
        (await s.q("update public.transactions set amount_paise = 1 where id = $1", [tid(1)]))
          .rowCount,
      ).toBe(0);
      expect(
        (await s.q("update public.accounts set name = 'Mine' where id = $1", [A_CASH])).rowCount,
      ).toBe(0);
      expect((await s.q("delete from public.savings_goals where id = $1", [A_GOAL])).rowCount).toBe(
        0,
      );
      expect(
        (await s.q("update public.profiles set display_name = 'x' where id = $1", [A])).rowCount,
      ).toBe(0);
      const err = await s.error("update public.transactions set owner_id = $1 where id = $2", [
        A,
        tid(2),
      ]);
      expect(err?.message).toMatch(/row-level security|transaction_field_immutable/);
    });
    const { rows } = await db.client.query(
      "select amount_paise from public.transactions where id = $1",
      [tid(1)],
    );
    expect(rows[0].amount_paise).toBe("1500");
  });

  it("can't link own rows to another user's account, category or expense", async () => {
    await as(db, B, async (s) => {
      const viaAccount = await s.error(
        `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id)
         values ($1, $2, 'expense', 100, now(), $3)`,
        [tid(11), B, A_CASH],
      );
      expect(viaAccount?.code).toBe("23503"); // foreign key: (owner_id, account_id) must be B's
      const viaCategory = await s.error(
        `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id, category_id)
         values ($1, $2, 'expense', 100, now(), $3, $4)`,
        [tid(12), B, B_CASH, f.aFood],
      );
      expect(viaCategory?.code).toBe("23503");
      const refundOfA = await s.error(
        `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id, refund_of_id)
         values ($1, $2, 'refund', 100, now(), $3, $4)`,
        [tid(13), B, B_CASH, tid(1)],
      );
      expect(refundOfA).not.toBeNull();
    });
  });

  it("ignores a client-supplied owner in RPC payloads", async () => {
    await as(db, B, async (s) => {
      const r = await s.rpc<{ status: string; transaction: { owner_id: string } }>(
        "create_transaction",
        [{ ...expenseJson(tid(20), 900, { account_id: B_CASH }), owner_id: A }],
      );
      expect(r.status).toBe("applied");
      expect(r.transaction.owner_id).toBe(B);
    });
  });

  it("doesn't reveal or reuse another user's transaction id through the RPC", async () => {
    await as(db, B, async (s) => {
      const r = await s.rpc<{ status: string; reason: string; transaction?: unknown }>(
        "create_transaction",
        [expenseJson(tid(1), 1500, { account_id: B_CASH })],
      );
      expect(r).toEqual({ status: "conflict", reason: "id_in_use" });
    });
  });

  it("allows no hard deletes of ledger rows and no client writes to rewards", async () => {
    await as(db, A, async (s) => {
      expect(
        (await s.error("delete from public.transactions where id = $1", [tid(1)]))?.message,
      ).toMatch(/permission denied/);
      expect(
        (
          await s.error(
            `insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, 'farm', 9999, 'x')`,
            [A],
          )
        )?.message,
      ).toMatch(/permission denied/);
      expect(
        (
          await s.error(
            `insert into public.user_achievements (owner_id, achievement_code) values ($1, 'streak_7_day')`,
            [A],
          )
        )?.message,
      ).toMatch(/permission denied/);
      expect(
        (await s.error("update public.streak_state set current_daily = 999"))?.message,
      ).toMatch(/permission denied/);
      expect(
        (
          await s.error(
            "insert into public.achievements (code, title, description, xp) values ('x1','x','x',1)",
          )
        )?.message,
      ).toMatch(/permission denied/);
      expect((await s.q("select count(*)::int as n from public.achievements")).rows[0]!.n).toBe(7);
    });
  });

  it("keeps the seeding function private", async () => {
    await as(db, A, async (s) => {
      expect((await s.error("select public.seed_user_defaults($1)", [B]))?.message).toMatch(
        /permission denied/,
      );
      await s.q("select public.ensure_my_defaults()"); // idempotent for the caller
      expect((await s.q("select count(*)::int as n from public.categories")).rows[0]!.n).toBe(52);
    });
  });
});

describe.skipIf(ADMIN_URL)("row level security (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
