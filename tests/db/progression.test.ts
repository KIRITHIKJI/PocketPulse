import { type Transaction, totalXp } from "@/domain";
import { rowToTransaction } from "@/lib/data/mappers";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { runLedgerCommandWith } from "@/lib/ledger/executor";
import { settleRewardSync, syncRewardsWith } from "@/lib/rewards/engine";

import { A, A_CASH, B, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type Session, type TestDb, as, createTestDb } from "./harness";
import { pgPort } from "./ledger-port";
import { pgRewardStore, rewardCatalog } from "./reward-store";

// Design 3, on the real schema: the new missions and the progress switch (migration
// 20261106000200), an Undo that lands while the save's reward sync is running, and
// achievements that stay unlocked once earned.

const settings = { timeZone: "Asia/Kolkata", weekStartsOn: 1 as const };

describe.skipIf(!ADMIN_URL)("Missions, the progress switch and a settled sync", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  const tea = (n: number): LedgerCommand =>
    ledgerCommandSchema.parse({
      kind: "create",
      opId: tid(810_000 + n),
      draft: {
        id: tid(710_000 + n),
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

  const ledger = async (s: Session): Promise<Transaction[]> =>
    (await s.q("select * from public.transactions where deleted_at is null")).rows.map(
      rowToTransaction,
    );

  /** Rewards are written as the server; the reads stay the user's. */
  async function asServer<T>(s: Session, work: () => Promise<T>): Promise<T> {
    await s.q("reset role", []);
    try {
      return await work();
    } finally {
      await s.q("set local role authenticated", []);
    }
  }

  it("seeds the four new missions, each with an amount-free rule", async () => {
    const { quests } = await rewardCatalog(db);
    const byCode = Object.fromEntries(quests.map((q) => [q.code, q]));
    expect(byCode.review_today).toMatchObject({ cadence: "daily", target: 1 });
    expect(byCode.set_aside_week).toMatchObject({ cadence: "weekly", target: 1 });
    expect(byCode.steady_logging).toMatchObject({ cadence: "once", target: 20 });
    expect(byCode.saving_habit).toMatchObject({ cadence: "once", target: 4 });
    // The original missions are untouched.
    expect(byCode.log_today).toMatchObject({ cadence: "daily", target: 1, xp: 5 });
    // Looking at spending is the job; asking for a purchase or an amount isn't.
    for (const q of quests) {
      expect(`${q.title} ${q.description}`).not.toMatch(
        /₹|\d+\s*rupees|\bbuy\b|\bspend (more|less)\b/i,
      );
    }
  });

  it("show_progress defaults to on, the owner can switch it, and nobody else can", async () => {
    await as(db, A, async (s) => {
      const { rows } = await s.q("select show_progress from public.profiles");
      expect(rows).toEqual([{ show_progress: true }]);
      await s.q("update public.profiles set show_progress = false where id = $1", [A]);
      expect((await s.q("select show_progress from public.profiles")).rows).toEqual([
        { show_progress: false },
      ]);
    });
    await as(db, B, async (s) => {
      const changed = await s.q("update public.profiles set show_progress = false where id = $1", [
        A,
      ]);
      expect(changed.rowCount).toBe(0);
    });
  });

  it("clients still can't write rewards, including the new 'looked at today' fact", async () => {
    await as(db, A, async (s) => {
      const error = await s.error(
        "insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, 'daily_review', 0, 'daily_review:2026-11-06')",
        [A],
      );
      expect(error?.code).toBe("42501");
    });
  });

  it("an Undo during the save's sync: the second pass takes the award back", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const catalog = await rewardCatalog(db);
      const store = pgRewardStore(db, A);
      const saved = await run(tea(1));
      if (!saved.ok || !saved.undo) throw new Error("expected a saved entry with an undo");
      const undo = saved.undo;

      const result = await asServer(s, () =>
        settleRewardSync(
          store,
          async (pass) => {
            await s.q("set local role authenticated", []);
            const rows = await ledger(s);
            // The Undo lands right after the save's sync has read the ledger.
            if (pass === 1) expect(await run(undo)).toMatchObject({ ok: true });
            await s.q("reset role", []);
            return { ledger: rows, goals: [], budgets: [], ...catalog, now: Date.now(), settings };
          },
          // Every row: within one test transaction now() doesn't move, so a time filter can't be used.
          async () =>
            (await s.q("select id, updated_at, deleted_at from public.transactions", [])).rows.map(
              (r) => ({
                id: r.id as string,
                updatedAt: new Date(r.updated_at as string).toISOString(),
                deletedAt: r.deleted_at ? new Date(r.deleted_at as string).toISOString() : null,
              }),
            ),
          { revoke: true },
        ),
      );
      expect(result.passes).toBe(2);
      expect(totalXp(result.outcome.state.events)).toBe(0);
      const { rows } = await db.client.query(
        "select source_key, revoked_at from public.xp_events where owner_id = $1 and source_key like 'logged_day:%'",
        [A],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).not.toBeNull();
    });
  });

  it("an achievement stays unlocked, with its XP, after the entries behind it are undone", async () => {
    await as(db, A, async (s) => {
      const run = (c: LedgerCommand) => runLedgerCommandWith(pgPort(s), c);
      const catalog = await rewardCatalog(db);
      const store = pgRewardStore(db, A);
      const sync = async () => {
        const rows = await ledger(s);
        return asServer(s, () =>
          syncRewardsWith(
            store,
            {
              ledger: rows,
              goals: [],
              budgets: [],
              ...catalog,
              now: Date.now(),
              settings,
            },
            { revoke: true },
          ),
        );
      };
      const undos: LedgerCommand[] = [];
      for (let n = 10; n < 20; n += 1) {
        const saved = await run(tea(n));
        if (saved.ok && saved.undo) undos.push(saved.undo);
      }
      const earned = await sync();
      expect(earned.state.achievements.map((a) => a.code)).toContain("first_10_transactions");
      const withAchievement = totalXp(earned.state.events);

      for (const undo of undos) await run(undo);
      const after = await sync();
      expect(after.state.achievements.map((a) => a.code)).toContain("first_10_transactions");
      const live = after.state.events.filter((e) => !e.revokedAt).map((e) => e.sourceKey);
      expect(live).toContain("achievement:first_10_transactions");
      // Today's day and mission went with the entries; the achievement's 50 XP didn't.
      expect(live.some((k) => k.startsWith("logged_day:"))).toBe(false);
      expect(totalXp(after.state.events)).toBeLessThan(withAchievement);
      expect(totalXp(after.state.events)).toBeGreaterThanOrEqual(50);

      // Ten more entries can't unlock it again.
      for (let n = 20; n < 30; n += 1) await run(tea(n));
      const again = await sync();
      expect(again.newAchievements).toEqual([]);
      const { rows } = await db.client.query(
        "select count(*)::int as n from public.xp_events where owner_id = $1 and kind = 'achievement' and source_key = 'achievement:first_10_transactions'",
        [A],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});

describe.skipIf(ADMIN_URL)("Missions, the progress switch and a settled sync (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
