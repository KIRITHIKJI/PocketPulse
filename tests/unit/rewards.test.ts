import { describe, expect, it } from "vitest";

import {
  OPT_OUT_PERIOD,
  XP,
  type ReminderSettings,
  type Transaction,
  budgetSchema,
  calculateRewards,
  calculateStreaks,
  dueReminders,
  formatINR,
  levelFor,
  loggedDays,
  rankFor,
  savingsGoalSchema,
  totalXp,
} from "@/domain";
import {
  type RewardState,
  type RewardStore,
  planRewardSync,
  syncRewardsWith,
} from "@/lib/rewards/engine";

import {
  CASH,
  LAPTOP_GOAL,
  OWNER,
  allocate,
  commitment,
  expense,
  id,
  income,
  ist,
  istMs,
  transfer,
} from "./domain/fixtures";

import { IST, TODAY, data, day, logged, memoryStore } from "./reward-fixtures";

describe("streaks across IST midnight", () => {
  const streak = (days: string[], today = TODAY) => calculateStreaks(days, today, IST);

  it("counts by the local day, so 23:59 and 00:00 IST are two days", () => {
    const entries = [logged(ist("2026-11-09", "23:59")), logged(ist("2026-11-10", "00:00"))];
    expect(loggedDays(entries, IST.timeZone)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(streak(loggedDays(entries, IST.timeZone)).currentDaily).toBe(2);
  });

  it("the same instants are one day in UTC terms but two here, and one in New York", () => {
    // 18:29 and 18:31 UTC straddle IST midnight.
    const a = logged("2026-11-09T18:29:00Z");
    const b = logged("2026-11-09T18:31:00Z");
    expect(loggedDays([a, b], "Asia/Kolkata")).toEqual(["2026-11-09", "2026-11-10"]);
    expect(loggedDays([a, b], "America/New_York")).toEqual(["2026-11-09"]);
  });

  it("two entries at 23:58 and 23:59 are one day, not two", () => {
    const entries = [logged(ist("2026-11-10", "23:58")), logged(ist("2026-11-10", "23:59"))];
    expect(loggedDays(entries, IST.timeZone)).toEqual(["2026-11-10"]);
  });

  it("isn't broken yet today, and a day off ends the run without touching the longest", () => {
    expect(streak(["2026-11-09", "2026-11-10"]).currentDaily).toBe(2);
    expect(streak(["2026-11-08", "2026-11-09"]).currentDaily).toBe(0);
    expect(streak(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-10"])).toMatchObject({
      currentDaily: 1,
      longestDaily: 3,
    });
    expect(streak([]).currentDaily).toBe(0);
  });

  it("runs across a month and a year", () => {
    expect(streak(["2026-12-31", "2027-01-01"], "2027-01-01").currentDaily).toBe(2);
    expect(streak(["2026-10-31", "2026-11-01"], "2026-11-01").currentDaily).toBe(2);
  });

  it("counts weeks by the user's week start", () => {
    const days = ["2026-11-01", "2026-11-02", "2026-11-09"]; // Sun, Mon, Mon
    expect(calculateStreaks(days, TODAY, IST).longestWeekly).toBe(3);
    expect(calculateStreaks(days, TODAY, { ...IST, weekStartsOn: 0 }).longestWeekly).toBe(2);
  });

  it("a week stays current through the following week", () => {
    expect(streak(["2026-11-03"]).currentWeekly).toBe(1);
    expect(streak(["2026-10-20"]).currentWeekly).toBe(0);
  });
});

describe("what earns XP", () => {
  it("logging once or fifty times in a day is one award", async () => {
    const entries = Array.from({ length: 50 }, () => logged(day(5)));
    const keys = calculateRewards({
      ...data(entries),
      reviewedWeeks: [],
      reviewedDays: [],
      insightsExplored: 0,
      optedOutQuests: [],
    }).events.filter((e) => e.kind === "logged_day");
    expect(keys.map((e) => e.sourceKey)).toEqual(["logged_day:2026-11-05"]);
  });

  it("backdating entries can't build a streak: only when they were logged counts", async () => {
    const store = memoryStore();
    const backdated = Array.from({ length: 8 }, (_, i) =>
      logged(day(11), { occurredAt: day(i + 1) }),
    );
    const { result } = await syncRewardsWith(store, data(backdated), { revoke: true });
    expect(result.loggedDays).toEqual([TODAY]);
    expect(store.state.achievements.map((a) => a.code)).not.toContain("streak_7_day");
  });

  it("the amount never matters: a ₹10 day and a ₹10,000 day earn the same", async () => {
    const small = await syncRewardsWith(memoryStore(), data([logged(day(5), {}, 1_000)]), {
      revoke: true,
    });
    const huge = await syncRewardsWith(memoryStore(), data([logged(day(5), {}, 10_00_000)]), {
      revoke: true,
    });
    expect(totalXp(small.state.events)).toBe(totalXp(huge.state.events));
  });

  it("goal money earns for saving, and transfers and income count as logging", () => {
    const r = calculateRewards({
      ...data([
        allocate(100_000, LAPTOP_GOAL, { occurredAt: day(3) }),
        { ...income(100), createdAt: day(4) },
      ]),
      reviewedWeeks: [],
      reviewedDays: [],
      insightsExplored: 0,
      optedOutQuests: [],
    });
    expect(r.achievementCodes).toContain("first_savings_goal");
    expect(r.events.map((e) => e.sourceKey)).toContain("saved_week:2026-11-02");
    expect(r.loggedDays).toEqual(["2026-11-04"]);
    const moved = { ...transfer(100, CASH, id(101)), createdAt: day(6) };
    expect(loggedDays([moved], IST.timeZone)).toEqual(["2026-11-06"]);
  });

  it("a clean week needs real activity, and an unassigned entry spoils it", () => {
    const week = (o: { categoryId?: string | null }, count = 3) =>
      Array.from({ length: count }, () => logged(day(3), o));
    const earned = (rows: Transaction[]) =>
      calculateRewards({
        ...data(rows),
        reviewedWeeks: [],
        reviewedDays: [],
        insightsExplored: 0,
        optedOutQuests: [],
      }).achievementCodes;
    expect(earned(week({}))).toContain("no_mystery_money");
    expect(earned(week({}, 2))).not.toContain("no_mystery_money");
    expect(earned([...week({}), logged(day(4), { categoryId: null })])).not.toContain(
      "no_mystery_money",
    );
    // The current week isn't finished, so it can't count yet.
    expect(earned(Array.from({ length: 3 }, () => logged(day(10))))).not.toContain(
      "no_mystery_money",
    );
  });

  it("a month under budget needs real logging and a budget set in time", () => {
    const october = Array.from({ length: 5 }, (_, i) =>
      logged(ist(`2026-10-${String(i + 10)}`), {}, 1_000),
    );
    const budget = (createdAt: string, limitPaise = 100_000) => ({
      ...budgetSchema.parse({ id: id(700), ownerId: OWNER, limitPaise }),
      createdAt,
    });
    const earned = (rows: Transaction[], b: ReturnType<typeof budget>) =>
      calculateRewards({
        ...data(rows, { budgets: [b] }),
        reviewedWeeks: [],
        reviewedDays: [],
        insightsExplored: 0,
        optedOutQuests: [],
      }).achievementCodes;
    const inTime = budget(ist("2026-10-01"));
    expect(earned(october, inTime)).toContain("monthly_budget_achieved");
    expect(earned(october.slice(1), inTime)).not.toContain("monthly_budget_achieved");
    expect(earned(october, budget(ist("2026-11-05")))).not.toContain("monthly_budget_achieved");
    expect(earned(october, budget(ist("2026-10-01"), 100))).not.toContain(
      "monthly_budget_achieved",
    );
  });
});

describe("undo takes back exactly what the entry earned", () => {
  const tea = logged(day(11));

  it("undoing today's only entry revokes the day and today's mission; saving again restores them once", async () => {
    const store = memoryStore();
    const saved = await syncRewardsWith(store, data([tea]), { revoke: true });
    const earned = totalXp(saved.state.events);
    expect(saved.state.events.map((e) => e.sourceKey)).toEqual(
      expect.arrayContaining([`logged_day:${TODAY}`, `quest:log_today:${TODAY}`]),
    );
    expect(saved.state.quests.find((q) => q.questCode === "log_today")?.completedAt).not.toBeNull();

    const undone = await syncRewardsWith(store, data([]), { revoke: true });
    expect(totalXp(undone.state.events)).toBe(0);
    expect(undone.state.quests.find((q) => q.questCode === "log_today")?.completedAt).toBeNull();

    // Saving again (a new entry, new ids) earns the same awards back, on the same rows.
    const again = logged(day(11));
    const redone = await syncRewardsWith(store, data([again]), { revoke: true });
    expect(totalXp(redone.state.events)).toBe(earned);
    expect(store.state.events).toHaveLength(saved.state.events.length);
    for (let i = 0; i < 3; i += 1) {
      await syncRewardsWith(store, data([]), { revoke: true });
      await syncRewardsWith(store, data([again]), { revoke: true });
    }
    expect(totalXp(store.state.events)).toBe(earned);
    expect(store.state.events).toHaveLength(saved.state.events.length);
  });

  it("undoing one of two entries that day takes nothing away", async () => {
    const store = memoryStore();
    const other = logged(day(11));
    const both = await syncRewardsWith(store, data([tea, other]), { revoke: true });
    const after = await syncRewardsWith(store, data([other]), { revoke: true });
    expect(totalXp(after.state.events)).toBe(totalXp(both.state.events));
  });

  it("an achievement stays once earned: undoing the tenth entry keeps it and its XP", async () => {
    const store = memoryStore();
    const nine = Array.from({ length: 9 }, () => logged(day(11)));
    const tenth = await syncRewardsWith(store, data([...nine, tea]), { revoke: true });
    expect(tenth.newAchievements).toContain("first_10_transactions");
    const xp = totalXp(tenth.state.events);

    // Nine entries are left. The day still has entries, so nothing at all is taken back.
    const undone = await syncRewardsWith(store, data(nine), { revoke: true });
    expect(undone.state.achievements.map((a) => a.code)).toContain("first_10_transactions");
    expect(totalXp(undone.state.events)).toBe(xp);
    expect(
      undone.state.events.find((e) => e.sourceKey === "achievement:first_10_transactions")
        ?.revokedAt,
    ).toBeNull();

    // A new tenth entry can't unlock it a second time or add its XP again.
    const redone = await syncRewardsWith(store, data([...nine, logged(day(11))]), { revoke: true });
    expect(redone.newAchievements).toEqual([]);
    expect(totalXp(redone.state.events)).toBe(xp);
    expect(store.state.events.filter((e) => e.kind === "achievement")).toHaveLength(1);
  });

  it("undoing the only entry of the day takes the day's XP and mission back, never the achievement", async () => {
    const store = memoryStore();
    const earlier = Array.from({ length: 9 }, () => logged(day(10)));
    await syncRewardsWith(store, data([...earlier, tea]), { revoke: true });
    const undone = await syncRewardsWith(store, data(earlier), { revoke: true });
    const live = undone.state.events.filter((e) => !e.revokedAt).map((e) => e.sourceKey);
    expect(live).not.toContain(`logged_day:${TODAY}`);
    expect(live).not.toContain(`quest:log_today:${TODAY}`);
    expect(live).toContain("achievement:first_10_transactions");
    expect(undone.state.achievements.map((a) => a.code)).toContain("first_10_transactions");
  });

  it("never touches awards that aren't about entries, or last period's missions", async () => {
    const store = memoryStore();
    store.state.events.push(
      {
        sourceKey: "weekly_review:2026-11-09",
        kind: "weekly_review",
        xp: XP.weeklyReview,
        createdAt: day(9),
        revokedAt: null,
      },
      {
        sourceKey: "quest:log_today:2026-11-05",
        kind: "quest",
        xp: 5,
        createdAt: day(5),
        revokedAt: null,
      },
    );
    await syncRewardsWith(store, data([tea]), { revoke: true });
    const { state } = await syncRewardsWith(store, data([]), { revoke: true });
    const live = state.events.filter((e) => e.revokedAt === null).map((e) => e.sourceKey);
    expect(live).toEqual(
      expect.arrayContaining(["weekly_review:2026-11-09", "quest:log_today:2026-11-05"]),
    );
    expect(state.achievements.map((a) => a.code)).toContain("weekly_review_complete");
  });

  it("a plan says when saving would take something back", () => {
    const before = {
      events: [
        {
          sourceKey: `logged_day:${TODAY}`,
          kind: "logged_day",
          xp: XP.loggedDay,
          createdAt: day(11),
          revokedAt: null,
        },
      ],
      achievements: [],
      quests: [],
    };
    const plan = planRewardSync(before, data([]), { revoke: true });
    expect(plan.revokedKeys).toEqual([`logged_day:${TODAY}`]);
    expect(plan.earnedSomething).toBe(false);
    expect(plan.changed).toBe(true);
  });
});

describe("rank words", () => {
  it("cover every level with plain words", () => {
    expect([1, 2, 3, 5, 8, 12, 40].map(rankFor)).toEqual([
      "Starter",
      "Starter",
      "Tracker",
      "Planner",
      "Strategist",
      "Steward",
      "Steward",
    ]);
    expect(rankFor(0)).toBe("Starter");
  });
});

describe("idempotency", () => {
  const entries = Array.from({ length: 12 }, (_, i) => logged(day(i < 8 ? i + 1 : 8)));

  it("syncing again changes nothing", async () => {
    const store = memoryStore();
    const first = await syncRewardsWith(store, data(entries), { revoke: true });
    expect(first.newAchievements).toEqual(
      expect.arrayContaining(["first_10_transactions", "streak_7_day"]),
    );
    const xp = totalXp(store.state.events);
    const again = await syncRewardsWith(store, data(entries), { revoke: true });
    expect(again.newAchievements).toEqual([]);
    expect(totalXp(store.state.events)).toBe(xp);
    expect(store.state.events).toHaveLength(first.state.events.length);
  });

  it("deleting entries revokes their days and the streak, but achievements stay", async () => {
    const store = memoryStore();
    const first = await syncRewardsWith(store, data(entries), { revoke: true });
    const achievementXp = first.state.events
      .filter((e) => e.kind === "achievement")
      .reduce((sum, e) => sum + e.xp, 0);
    const { streaks, state } = await syncRewardsWith(store, data(entries.slice(0, 2)), {
      revoke: true,
    });
    // Two entries on two days are left: two logged days, plus the achievements already earned.
    expect(totalXp(state.events)).toBe(2 * XP.loggedDay + achievementXp);
    expect(state.achievements.map((a) => a.code)).toEqual(
      expect.arrayContaining(["first_10_transactions", "streak_7_day"]),
    );
    expect(streaks.longestDaily).toBe(2);
  });

  it("adding, deleting and adding again can't farm a day", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i += 1) {
      await syncRewardsWith(store, data([logged(day(5))]), { revoke: true });
      await syncRewardsWith(store, data([]), { revoke: true });
    }
    expect(store.state.events.filter((e) => e.kind === "logged_day")).toHaveLength(1);
    expect(totalXp(store.state.events)).toBe(0);
    await syncRewardsWith(store, data([logged(day(5))]), { revoke: true });
    expect(totalXp(store.state.events)).toBe(XP.loggedDay);
  });

  it("editing an entry's amount or date earns nothing new", async () => {
    const store = memoryStore();
    const entry = logged(day(5));
    await syncRewardsWith(store, data([entry]), { revoke: true });
    const xp = totalXp(store.state.events);
    await syncRewardsWith(
      store,
      data([{ ...entry, amountPaise: 9_999, occurredAt: day(6), updatedAt: day(9) }]),
      { revoke: true },
    );
    expect(totalXp(store.state.events)).toBe(xp);
  });

  it("a quest counts once per period", async () => {
    const store = memoryStore();
    const today = logged(day(11));
    await syncRewardsWith(store, data([today]), { revoke: true });
    await syncRewardsWith(store, data([today]), { revoke: true });
    const quest = store.state.events.filter((e) => e.sourceKey.startsWith("quest:log_today"));
    expect(quest.map((e) => e.sourceKey)).toEqual([`quest:log_today:${TODAY}`]);
  });

  it("a skipped quest awards nothing", async () => {
    const store = memoryStore();
    store.state.quests.push({
      questCode: "log_today",
      periodKey: "opt-out",
      progress: 0,
      completedAt: null,
      optedOutAt: ist("2026-11-01"),
    });
    await syncRewardsWith(store, data([logged(day(11))]), { revoke: true });
    expect(store.state.events.some((e) => e.sourceKey.startsWith("quest:log_today"))).toBe(false);
  });

  it("a goal's quest and Spending Detective come from what's stored", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i += 1) {
      store.state.events.push({
        kind: "insight_explored",
        xp: 0,
        sourceKey: `insight:${i}`,
        createdAt: ist("2026-11-01"),
        revokedAt: null,
      });
    }
    const goal = savingsGoalSchema.parse({
      id: LAPTOP_GOAL,
      ownerId: OWNER,
      title: "Laptop",
      targetPaise: 100,
    });
    const { state } = await syncRewardsWith(store, data([], { goals: [goal] }), { revoke: true });
    expect(state.achievements.map((a) => a.code)).toContain("spending_detective");
    expect(state.events.map((e) => e.sourceKey)).toContain("quest:set_a_goal:once");
  });
});

describe("levels", () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [299, 2],
    [300, 3],
    [600, 4],
  ])("%i XP is level %i", (xp, level) => {
    expect(levelFor(xp).level).toBe(level);
  });

  it("reports progress through the level, in whole basis points", () => {
    expect(levelFor(150)).toEqual({ level: 2, floorXp: 100, nextLevelXp: 300, progressBp: 2_500 });
  });

  it("revoked events don't count", () => {
    expect(totalXp([{ xp: 10 }, { xp: 20, revokedAt: ist("2026-11-01") }])).toBe(10);
  });
});

describe("reminder preferences", () => {
  const off: ReminderSettings = {
    allDisabled: false,
    missedLogging: false,
    missedLoggingTime: "21:00",
    missedLoggingDays: "daily",
    weeklyReview: false,
    weeklyReviewDay: 3,
    upcomingIncome: false,
    upcomingIncomeDays: 1,
    budgetAlerts: false,
    upcomingCommitments: false,
    upcomingCommitmentDays: 2,
    savingsReview: false,
    savingsReviewFrequency: "monthly",
  };
  const on: ReminderSettings = {
    ...off,
    missedLogging: true,
    weeklyReview: true,
    upcomingIncome: true,
    budgetAlerts: true,
    upcomingCommitments: true,
    savingsReview: true,
  };
  const budget = budgetSchema.parse({ id: id(700), ownerId: OWNER, limitPaise: 10_000 });
  const goal = savingsGoalSchema.parse({
    id: LAPTOP_GOAL,
    ownerId: OWNER,
    title: "Laptop",
    targetPaise: 100,
  });
  const evening = istMs("2026-11-11", "21:30");
  const input = {
    ledger: [expense(9_000, { occurredAt: ist("2026-11-02") })],
    budgets: [budget],
    commitments: [commitment(5_000, "2026-11-12")],
    templates: [],
    goals: [goal],
    nextIncomeDate: "2026-11-12",
    now: evening,
    settings: IST,
    money: formatINR,
    dateText: (date: string) => date,
  };
  const kinds = (prefs: ReminderSettings, over: Partial<typeof input> = {}) =>
    dueReminders({ ...input, ...over, prefs }).map((r) => r.kind);

  it("everything is quiet unless turned on", () => {
    expect(kinds(off)).toEqual([]);
  });

  it("each one comes only when it's on", () => {
    expect(kinds(on)).toEqual([
      "missed_logging",
      "weekly_review",
      "upcoming_income",
      "budget_threshold",
      "upcoming_commitment",
      "savings_review",
    ]);
    expect(kinds({ ...off, savingsReview: true })).toEqual(["savings_review"]);
    expect(kinds({ ...off, budgetAlerts: true })).toEqual(["budget_threshold"]);
  });

  it("turning off all beats every individual choice", () => {
    expect(kinds({ ...on, allDisabled: true })).toEqual([]);
  });

  it("the missed-log nudge waits for its time, and skips days with an entry", () => {
    const prefs = { ...off, missedLogging: true };
    expect(kinds(prefs, { now: istMs("2026-11-11", "20:59") })).toEqual([]);
    expect(kinds(prefs, { ledger: [logged(ist("2026-11-11", "09:00"))] })).toEqual([]);
    // After 23:59 IST the next day has started, and the nudge is about that day.
    expect(kinds(prefs, { now: istMs("2026-11-12", "00:01") })).toEqual([]);
  });

  it("weekdays-only stays quiet at the weekend", () => {
    const prefs = { ...off, missedLogging: true, missedLoggingDays: "weekdays" as const };
    expect(kinds(prefs, { now: istMs("2026-11-14", "21:30") })).toEqual([]);
    expect(kinds(prefs, { now: istMs("2026-11-13", "21:30") })).toEqual(["missed_logging"]);
  });

  it("honours the lead time for allowance and bills, and a paid bill says nothing", () => {
    const income_ = { ...off, upcomingIncome: true, upcomingIncomeDays: 0 };
    expect(kinds(income_)).toEqual([]);
    expect(kinds({ ...income_, upcomingIncomeDays: 1 })).toEqual(["upcoming_income"]);
    const bills = { ...off, upcomingCommitments: true, upcomingCommitmentDays: 0 };
    expect(kinds(bills)).toEqual([]);
    const paid = expense(5_000, { occurredAt: ist("2026-11-10") });
    expect(
      kinds(
        { ...bills, upcomingCommitmentDays: 3 },
        {
          ledger: [paid],
          commitments: [commitment(5_000, "2026-11-12", { paidTransactionId: paid.id })],
        },
      ),
    ).toEqual([]);
  });

  it("only looks ahead: an overdue bill belongs on the bills screen, not in a new reminder", () => {
    const prefs = { ...off, upcomingCommitments: true };
    expect(kinds(prefs, { commitments: [commitment(5_000, "2026-11-10")] })).toEqual([]);
  });

  it("a key is the same on a repeat, and differs by period", () => {
    const prefs = { ...off, savingsReview: true };
    const key = (now: number) => dueReminders({ ...input, prefs, now })[0]?.dedupeKey;
    expect(key(evening)).toBe(key(evening + 3_600_000));
    expect(key(istMs("2026-12-01"))).not.toBe(key(evening));
    const weekly = { ...prefs, savingsReviewFrequency: "weekly" as const };
    const weekKey = (now: number) => dueReminders({ ...input, prefs: weekly, now })[0]?.dedupeKey;
    expect(weekKey(evening)).toBe(weekKey(istMs("2026-11-15")));
    expect(weekKey(evening)).not.toBe(weekKey(istMs("2026-11-16")));
  });

  it("a budget reminder moves up a level, once each", () => {
    const prefs = { ...off, budgetAlerts: true };
    const key = (amount: number) =>
      dueReminders({
        ...input,
        prefs,
        ledger: [expense(amount, { occurredAt: ist("2026-11-02") })],
      })[0]?.dedupeKey;
    expect(key(8_500)).toBe(key(9_000));
    expect(key(8_500)).not.toBe(key(10_500));
  });

  it("never scolds", () => {
    const text = dueReminders({ ...input, prefs: on })
      .map((r) => `${r.title} ${r.body}`)
      .join(" ");
    expect(text).not.toMatch(/\b(failed|missed|broke|lost|should|must|don['’]t forget)\b/i);
  });
});

describe("sync without reading back", () => {
  const entries = Array.from({ length: 12 }, (_, i) => logged(day(i < 8 ? i + 1 : 8)));
  // What a fresh read shows, without the timestamps the database (or the plan) stamps.
  const shape = (state: RewardState) => ({
    events: state.events.map((e) => `${e.sourceKey}:${e.xp}:${e.revokedAt}`).sort(),
    achievements: state.achievements.map((a) => a.code).sort(),
    quests: state.quests
      .map(
        (q) => `${q.questCode}:${q.periodKey}:${q.completedAt !== null}:${q.optedOutAt !== null}`,
      )
      .sort(),
  });

  it.each([
    ["an empty store", [] as Transaction[], 0],
    ["a first sync", entries, 0],
    ["a later sync with new entries", [...entries, logged(day(10)), logged(day(11))], 1],
  ])(
    "returns the state a fresh read would show after %s, reading once",
    async (_, ledger, prior) => {
      const store = memoryStore();
      if (prior) await syncRewardsWith(store, data(entries), { revoke: true });
      // An opted-out quest row is stored state that a sync must carry over untouched.
      store.state.quests.push({
        questCode: "set_a_goal",
        periodKey: OPT_OUT_PERIOD,
        progress: 0,
        completedAt: null,
        optedOutAt: ist("2026-11-02"),
      });
      let reads = 0;
      const counted: RewardStore = { ...store, read: () => (reads++, store.read()) };
      const outcome = await syncRewardsWith(counted, data(ledger), { revoke: true });
      expect(reads).toBe(1);
      expect(shape(outcome.state)).toEqual(shape(await store.read()));
      expect(totalXp(outcome.state.events)).toBe(totalXp(store.state.events));
    },
  );

  it("a plan says whether there's anything to save, and saves nothing itself", async () => {
    const store = memoryStore();
    const plan = planRewardSync(await store.read(), data(entries), { revoke: true });
    expect(plan.earnedSomething).toBe(true);
    expect(store.state.events).toEqual([]);
    await syncRewardsWith(store, data(entries), { revoke: true });
    expect(
      planRewardSync(await store.read(), data(entries), { revoke: true }).earnedSomething,
    ).toBe(false);
  });
});
