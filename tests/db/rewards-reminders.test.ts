import {
  type AchievementDefinition,
  type QuestDefinition,
  type Transaction,
  totalXp,
} from "@/domain";
import { rowToTransaction } from "@/lib/data/mappers";
import { type RewardStore, syncRewardsWith } from "@/lib/rewards/engine";

import { A, A_CASH, B, type Fixtures, seedFixtures, tid } from "./fixtures";
import { ADMIN_URL, SKIP_REASON, type TestDb, as, createTestDb } from "./harness";

// Phase 9: reward state can't be written from a browser, the server's writes are idempotent at the
// database level, one user's rewards and reminders are invisible to another, and deleting an
// account removes all of it.

const NOW = Date.parse("2026-11-11T18:00:00+05:30");
const settings = { timeZone: "Asia/Kolkata", weekStartsOn: 1 as const };

describe.skipIf(!ADMIN_URL)("Phase 9: rewards, reminders and ownership", () => {
  let db: TestDb;
  let f: Fixtures;

  beforeAll(async () => {
    db = await createTestDb();
    f = await seedFixtures(db);
  });
  afterAll(async () => {
    await db?.close();
  });

  /** What the admin client does: writes as the server, for one user id, with the same keys. */
  function serverStore(userId: string): RewardStore {
    const q = (text: string, params: unknown[]) => db.client.query(text, params);
    return {
      async read() {
        const events = await q("select * from public.xp_events where owner_id = $1", [userId]);
        const unlocked = await q("select * from public.user_achievements where owner_id = $1", [
          userId,
        ]);
        const quests = await q("select * from public.user_quests where owner_id = $1", [userId]);
        return {
          events: events.rows.map((e) => ({
            sourceKey: e.source_key,
            kind: e.kind,
            xp: e.xp,
            createdAt: e.created_at,
            revokedAt: e.revoked_at,
          })),
          achievements: unlocked.rows.map((a) => ({
            code: a.achievement_code,
            unlockedAt: a.unlocked_at,
          })),
          quests: quests.rows.map((r) => ({
            questCode: r.quest_code,
            periodKey: r.period_key,
            completedAt: r.completed_at,
            optedOutAt: r.opted_out_at,
          })),
        };
      },
      async addEvents(events) {
        for (const e of events) {
          await q(
            `insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, $2, $3, $4)
             on conflict (owner_id, source_key) do nothing`,
            [userId, e.kind, e.xp, e.sourceKey],
          );
        }
      },
      async addAchievements(codes) {
        for (const code of codes) {
          await q(
            `insert into public.user_achievements (owner_id, achievement_code) values ($1, $2)
             on conflict do nothing`,
            [userId, code],
          );
        }
      },
      async saveQuests(rows) {
        for (const r of rows) {
          await q(
            `insert into public.user_quests (owner_id, quest_code, period_key, progress, completed_at)
             values ($1, $2, $3, $4, case when $5 then now() end)
             on conflict (owner_id, quest_code, period_key)
             do update set progress = excluded.progress, completed_at = excluded.completed_at`,
            [userId, r.code, r.periodKey, r.progress, r.complete],
          );
        }
      },
      async saveStreaks(s) {
        await q(
          `update public.streak_state set current_daily = $2, longest_daily = $3 where owner_id = $1`,
          [userId, s.currentDaily, s.longestDaily],
        );
      },
    };
  }

  async function catalog() {
    const achievements = await db.client.query("select * from public.achievements");
    const quests = await db.client.query("select * from public.quests");
    return {
      achievements: achievements.rows as AchievementDefinition[],
      quests: quests.rows as QuestDefinition[],
    };
  }

  async function ledgerOf(userId: string): Promise<Transaction[]> {
    const { rows } = await db.client.query(
      "select * from public.transactions where owner_id = $1 and deleted_at is null",
      [userId],
    );
    return rows.map(rowToTransaction);
  }

  const data = async (userId: string) => ({
    ledger: await ledgerOf(userId),
    goals: [],
    budgets: [],
    ...(await catalog()),
    now: NOW,
    settings,
  });

  it("clients can read their reward state but can't write any of it", async () => {
    await as(db, A, async (s) => {
      const denied = async (sql: string, params: unknown[]) =>
        expect((await s.error(sql, params))?.code).toBe("42501");
      await denied(
        "insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, 'cheat', 9999, 'x')",
        [A],
      );
      await denied(
        "insert into public.user_achievements (owner_id, achievement_code) values ($1, 'streak_7_day')",
        [A],
      );
      await denied(
        "insert into public.user_quests (owner_id, quest_code, period_key) values ($1, 'log_today', 'x')",
        [A],
      );
      await denied("update public.streak_state set current_daily = 999 where owner_id = $1", [A]);
      await denied(
        "insert into public.achievements (code, title, description, xp) values ('x', 'x', 'x', 1)",
        [],
      );
      expect((await s.q("select * from public.xp_events")).rows).toEqual([]);
    });
  });

  it("awards once however often it runs, and survives deleting the entries", async () => {
    await db.client.query(
      `insert into public.transactions
         (id, owner_id, type, amount_paise, occurred_at, account_id, category_id, idempotency_key)
       values ($1::uuid, $2, 'expense', 1500, '2026-11-11T09:00:00+05:30', $3, $4, $5)`,
      [tid(1), A, A_CASH, f.aFood, tid(1)],
    );

    const store = serverStore(A);
    const first = await syncRewardsWith(store, await data(A));
    expect(first.state.events.length).toBeGreaterThan(0);
    const xp = totalXp(first.state.events);

    const again = await Promise.all([
      syncRewardsWith(store, await data(A)),
      syncRewardsWith(store, await data(A)),
    ]);
    expect(again.every((o) => totalXp(o.state.events) === xp)).toBe(true);

    await db.client.query("update public.transactions set deleted_at = now() where id = $1", [
      tid(1),
    ]);
    const after = await syncRewardsWith(store, await data(A));
    expect(totalXp(after.state.events)).toBe(xp);
  });

  it("the database itself refuses a second row for a key", async () => {
    const insert = () =>
      db.client.query(
        "insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, 'x', 1, 'dup')",
        [B],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
  });

  it("one user's rewards and reminders are invisible to another", async () => {
    await db.client.query(
      `insert into public.notifications (owner_id, kind, title, dedupe_key)
       values ($1, 'weekly_review', 'Private', 'private-a')`,
      [A],
    );
    await as(db, B, async (s) => {
      for (const table of ["notifications", "user_achievements", "user_quests"]) {
        const { rows } = await s.q(`select * from public.${table} where owner_id = $1`, [A]);
        expect(rows, table).toEqual([]);
      }
      expect((await s.q("select * from public.xp_events where owner_id = $1", [A])).rows).toEqual(
        [],
      );
      const changed = await s.q(
        "update public.notifications set title = 'Mine' where dedupe_key = 'private-a' returning id",
      );
      expect(changed.rows).toEqual([]);
    });
  });

  it("a reminder key is unique, so a repeat creates nothing", async () => {
    await as(db, A, async (s) => {
      const add = () =>
        s.q(
          `insert into public.notifications (owner_id, kind, title, dedupe_key)
           values ($1, 'savings_review', 'Savings', 'savings:2026-11')
           on conflict (owner_id, dedupe_key) do nothing returning id`,
          [A],
        );
      expect((await add()).rows).toHaveLength(1);
      expect((await add()).rows).toHaveLength(0);
    });
  });

  it("reminders stay quiet by default, and the schedule is range-checked", async () => {
    const { rows } = await db.client.query(
      "select * from public.notification_preferences where owner_id = $1",
      [A],
    );
    expect(rows[0]).toMatchObject({
      all_disabled: false,
      missed_logging: false,
      weekly_review: false,
      upcoming_income: false,
      upcoming_commitments: false,
      savings_review: false,
      push_enabled: false,
      budget_alerts: true,
      missed_logging_days: "daily",
      savings_review_frequency: "monthly",
    });
    await as(db, A, async (s) => {
      expect(
        await s.error(
          "update public.notification_preferences set upcoming_income_days = 99 where owner_id = $1",
          [A],
        ),
      ).toMatchObject({ code: "23514" });
      expect(
        await s.error(
          "update public.notification_preferences set savings_review_frequency = 'hourly' where owner_id = $1",
          [A],
        ),
      ).toMatchObject({ code: "23514" });
    });
  });

  it("deleting an account removes its rewards and reminders, and nobody else's", async () => {
    const user = "dddddddd-0000-4000-8000-000000000004";
    await db.client.query("begin");
    try {
      await db.client.query("insert into auth.users (id, email) values ($1, 'd@example.test')", [
        user,
      ]);
      await db.client.query(
        "insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, 'x', 1, 'k')",
        [user],
      );
      await db.client.query(
        `insert into public.notifications (owner_id, kind, title, dedupe_key)
         values ($1, 'weekly_review', 'T', 'k')`,
        [user],
      );
      await db.client.query(
        "insert into public.user_achievements (owner_id, achievement_code) values ($1, 'streak_7_day')",
        [user],
      );
      const others = await db.client.query(
        "select count(*)::int as n from public.xp_events where owner_id <> $1",
        [user],
      );

      await db.client.query("delete from auth.users where id = $1", [user]);
      for (const table of ["xp_events", "notifications", "user_achievements", "streak_state"]) {
        const { rows } = await db.client.query(
          `select 1 from public.${table} where owner_id = $1`,
          [user],
        );
        expect(rows, table).toEqual([]);
      }
      const still = await db.client.query("select count(*)::int as n from public.xp_events");
      expect(still.rows[0].n).toBe(others.rows[0].n);
    } finally {
      await db.client.query("rollback");
    }
  });
});

describe.skipIf(ADMIN_URL)("Phase 9: rewards, reminders and ownership (skipped)", () => {
  it.skip(SKIP_REASON, () => {});
});
