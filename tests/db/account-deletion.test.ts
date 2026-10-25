import {
  A,
  A_BANK,
  A_CASH,
  A_GOAL,
  B,
  type Fixtures,
  expenseJson,
  seedFixtures,
  tid,
} from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type TestDb, as, createTestDb } from "./harness";

const OWNED_TABLES = [
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

async function ownedCounts(db: TestDb, owner: string) {
  const counts: Record<string, number> = {};
  for (const table of OWNED_TABLES) {
    const { rows } = await db.client.query(
      `select count(*)::int as n from public.${table} where owner_id = $1`,
      [owner],
    );
    counts[table] = rows[0].n;
  }
  const { rows } = await db.client.query(
    "select count(*)::int as n from public.profiles where id = $1",
    [owner],
  );
  counts.profiles = rows[0].n;
  return counts;
}

describe.skipIf(!ADMIN_URL)("account deletion", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
    // Give user A a full graph of interlinked financial history (committed, not rolled back).
    const q = (text: string, params: unknown[] = []) => db.client.query(text, params);
    await q("begin");
    await q("set local role authenticated");
    await q("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: A, role: "authenticated" }),
    ]);
    await q("select public.create_transaction($1)", [
      expenseJson(tid(1), 50000, { category_id: f.aFood }),
    ]);
    await q("select public.create_transaction($1)", [
      {
        ...expenseJson(tid(2), 20000),
        type: "refund",
        refund_of_id: tid(1),
        occurred_at: "2026-10-06T12:00:00+05:30",
      },
    ]);
    await q("select public.create_transfer($1, $2, $3, 10000, now())", [tid(3), A_BANK, A_CASH]);
    await q("select public.move_goal_money($1, $2, 'allocation', 30000, now())", [tid(4), A_GOAL]);
    const { rows } = await q(
      `insert into public.recurring_templates (owner_id, kind, title, amount_paise, account_id, category_id, cadence, anchor_date, next_due_date)
       values ($1, 'expense', 'Hostel', 300000, $2, $3, 'monthly', '2026-10-01', '2026-11-01') returning id`,
      [A, A_CASH, f.aFood],
    );
    await q(
      `insert into public.commitments (owner_id, title, amount_paise, due_date, recurring_template_id, recurring_occurrence)
       values ($1, 'Hostel', 300000, '2026-11-01', $2, '2026-11-01')`,
      [A, rows[0].id],
    );
    await q(
      "insert into public.budgets (owner_id, category_id, limit_paise) values ($1, $2, 500000)",
      [A, f.aFood],
    );
    await q(
      "insert into public.category_rules (owner_id, match_text, category_id, subcategory_id) values ($1, 'chai', $2, $3)",
      [A, f.aFood, f.aTea],
    );
    await q(
      "insert into public.notifications (owner_id, kind, title, dedupe_key) values ($1, 'weekly_review', 'Review', 'wr:1')",
      [A],
    );
    await q(
      "insert into public.sync_operations (id, owner_id, operation, status) values ($1, $2, 'create', 'applied')",
      [tid(9), A],
    );
    await q("insert into public.sync_devices (id, owner_id) values ('laptop', $1)", [A]);
    await q("commit");
    // Rewards are written server-side.
    await q(
      "insert into public.xp_events (owner_id, kind, xp, source_key, transaction_id) values ($1, 'logged', 5, 'tx:1', $2)",
      [A, tid(1)],
    );
    await q(
      "insert into public.user_achievements (owner_id, achievement_code) values ($1, 'first_10_transactions')",
      [A],
    );
    await q(
      "insert into public.user_quests (owner_id, quest_code, period_key, progress) values ($1, 'log_today', '2026-10-26', 1)",
      [A],
    );
    await db.client.query(
      `insert into public.transactions (id, owner_id, type, amount_paise, occurred_at, account_id)
       select $1, $2, 'expense', 999, now(), id from public.accounts where owner_id = $2 limit 1`,
      [tid(50), B],
    );
  });
  afterAll(async () => {
    await db?.close();
  });

  it("still blocks deleting records that history depends on", async () => {
    await as(db, A, async (s) => {
      expect((await s.error("delete from public.accounts where id = $1", [A_CASH]))?.code).toBe(
        "23503",
      );
      expect((await s.error("delete from public.categories where id = $1", [f.aFood]))?.code).toBe(
        "23503",
      );
      expect(
        (await s.error("delete from public.savings_goals where id = $1", [A_GOAL]))?.code,
      ).toBe("23503");
    });
  });

  it("deleting the auth user removes every row of that user and nothing else", async () => {
    const before = await ownedCounts(db, A);
    for (const table of [
      "transactions",
      "accounts",
      "categories",
      "xp_events",
      "commitments",
      "user_achievements",
    ]) {
      expect(before[table], table).toBeGreaterThan(0);
    }
    const bBefore = await ownedCounts(db, B);

    await db.client.query("delete from auth.users where id = $1", [A]);

    const after = await ownedCounts(db, A);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    expect(await ownedCounts(db, B)).toEqual(bBefore);
  });
});

describe.skipIf(ADMIN_URL)("account deletion (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
