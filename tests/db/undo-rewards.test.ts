import {
  type Transaction,
  budgetSchema,
  categoryBreakdown,
  consolidatedBalanceAt,
  evaluateBudget,
  netSpending,
  resolvePeriod,
  totalXp,
} from "@/domain";
import { rowToAccount, rowToTransaction } from "@/lib/data/mappers";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";
import { syncRewardsWith } from "@/lib/rewards/engine";

import { A, A_CASH, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";
import { pgRewardStore, rewardCatalog } from "./reward-store";

// Design 2: a one-tap quick-add save and its Undo, through the real mutation layer and the reward
// sync the server runs after each write. Undo must put every figure back and take back exactly
// the XP and mission progress the entry earned; saving again must never earn it twice.

const settings = { timeZone: "Asia/Kolkata", weekStartsOn: 1 as const };

describe.skipIf(!ADMIN_URL)("Undo of a quick-add save", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  // Entries are logged "now" (created_at is the database clock), so rewards are worked out now.
  const tea = (n: number): LedgerCommand =>
    ledgerCommandSchema.parse({
      kind: "create",
      opId: tid(800_000 + n),
      draft: {
        id: tid(700_000 + n),
        type: "expense",
        amountPaise: 1_500,
        currency: "INR",
        occurredAt: new Date().toISOString(),
        accountId: A_CASH,
        categoryId: f.aFood,
        subcategoryId: f.aTea,
        description: "Tea",
        source: "quick_add",
      },
    });

  async function figures(s: Session) {
    const now = Date.now();
    const accounts = (await s.q("select * from public.accounts")).rows.map(rowToAccount);
    const ledger: Transaction[] = (await s.q("select * from public.transactions")).rows.map(
      rowToTransaction,
    );
    const today = resolvePeriod({ kind: "today" }, now, settings);
    const month = resolvePeriod({ kind: "this_month" }, now, settings);
    const budget = budgetSchema.parse({ id: tid(1), ownerId: A, limitPaise: 100_000 });
    return {
      balance: consolidatedBalanceAt(accounts, ledger, now + 1_000, settings.timeZone).balancePaise,
      spentToday: netSpending(ledger, today),
      budgetSpent: evaluateBudget(budget, ledger, now, settings).spentPaise,
      food:
        categoryBreakdown(ledger, month).categories.find((g) => g.key === f.aFood)?.netPaise ?? 0,
      ledger,
    };
  }

  /**
   * The reward sync the server runs after a write. Clients can't write rewards (RLS), so it runs
   * as the server for a moment, inside the same transaction, then goes back to being the user.
   */
  async function rewards(s: Session) {
    const { ledger } = await figures(s);
    const active = ledger.filter((tx) => !tx.deletedAt);
    await s.q("reset role", []);
    try {
      return await syncRewardsWith(
        pgRewardStore(db, A),
        {
          ledger: active,
          goals: [],
          budgets: [],
          ...(await rewardCatalog(db)),
          now: Date.now(),
          settings,
        },
        { revoke: true },
      );
    } finally {
      await s.q("set local role authenticated", []);
    }
  }

  it("puts every figure back, takes back its XP, and saving again never earns twice", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const before = await figures(s);
      const start = await rewards(s);
      expect(totalXp(start.state.events)).toBe(0);

      // One tap: saved, and the reward sync awards today's day and today's mission.
      const first = tea(1);
      const saved = await run(first);
      expect(saved).toMatchObject({ ok: true, status: "applied" });
      const afterSave = await figures(s);
      expect(afterSave.balance).toBe(before.balance - 1_500);
      expect(afterSave.spentToday).toBe(before.spentToday + 1_500);
      expect(afterSave.budgetSpent).toBe(before.budgetSpent + 1_500);
      expect(afterSave.food).toBe(before.food + 1_500);
      const earned = await rewards(s);
      const xp = totalXp(earned.state.events);
      expect(xp).toBeGreaterThan(0);
      const keys = earned.state.events.map((e) => e.sourceKey);
      expect(keys.some((k) => k.startsWith("logged_day:"))).toBe(true);
      expect(keys.some((k) => k.startsWith("quest:log_today:"))).toBe(true);

      // A fast double tap replays the same ids: no second entry, no second award.
      expect(await run(first)).toMatchObject({ ok: true, status: "duplicate" });
      expect(totalXp((await rewards(s)).state.events)).toBe(xp);

      // Undo: the inverse command the server handed back.
      const undo = saved.ok ? saved.undo : null;
      expect(undo).toMatchObject({ kind: "delete", id: tid(700_001) });
      expect(await run(undo!)).toMatchObject({ ok: true });
      const afterUndo = await figures(s);
      expect(afterUndo.balance).toBe(before.balance);
      expect(afterUndo.spentToday).toBe(before.spentToday);
      expect(afterUndo.budgetSpent).toBe(before.budgetSpent);
      expect(afterUndo.food).toBe(before.food);
      const revoked = await rewards(s);
      expect(totalXp(revoked.state.events)).toBe(0);
      const quest = await s.q(
        "select completed_at from public.user_quests where quest_code = 'log_today' and period_key <> 'opt-out'",
      );
      expect(quest.rows.every((r) => r.completed_at === null)).toBe(true);

      // A late replay of the undone save is still the same entry: nothing comes back.
      expect(await run(first)).toMatchObject({ ok: true, status: "duplicate" });
      expect((await figures(s)).balance).toBe(before.balance);
      expect(totalXp((await rewards(s)).state.events)).toBe(0);

      // Saving again (a new tap, new ids) earns the same awards once, on the same rows.
      for (let n = 2; n <= 4; n += 1) {
        const again = await run(tea(n));
        expect(again).toMatchObject({ ok: true, status: "applied" });
        expect(totalXp((await rewards(s)).state.events)).toBe(xp);
        if (!again.ok || !again.undo) throw new Error("expected an undo");
        await run(again.undo);
        expect(totalXp((await rewards(s)).state.events)).toBe(0);
      }
      const final = await run(tea(5));
      expect(final).toMatchObject({ ok: true, status: "applied" });
      const restored = await rewards(s);
      expect(totalXp(restored.state.events)).toBe(xp);
      const { rows } = await db.client.query(
        "select source_key, count(*)::int as n from public.xp_events where owner_id = $1 group by 1",
        [A],
      );
      expect(rows.every((r) => r.n === 1)).toBe(true);
      expect(rows.map((r) => r.source_key).sort()).toEqual([...keys].sort());
    });
  });
});

describe.skipIf(ADMIN_URL)("Undo of a quick-add save (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
