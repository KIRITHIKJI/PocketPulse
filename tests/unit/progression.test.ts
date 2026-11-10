import { describe, expect, it } from "vitest";

import { XP, budgetSchema, calculateRewards, loggedDays, totalXp } from "@/domain";
import {
  type LedgerStamp,
  type RewardData,
  type RewardState,
  ledgerChanged,
  ledgerRemoved,
  revokesRewards,
  settleRewardSync,
  syncRewardsWith,
} from "@/lib/rewards/engine";
import { hasFeedback, rewardFeedback } from "@/lib/rewards/feedback";

import { LAPTOP_GOAL, OWNER, allocate, id, ist } from "./domain/fixtures";
import { ACHIEVEMENTS, MISSIONS, TODAY, data, day, logged, memoryStore } from "./reward-fixtures";

// Design 3: missions, achievement progress, and the feedback the ladder shows after a save.

const all = (extra: Partial<RewardData> = {}) => ({ quests: MISSIONS, ...extra });
const facts = { reviewedWeeks: [], reviewedDays: [], insightsExplored: 0, optedOutQuests: [] };
const mission = (r: ReturnType<typeof calculateRewards>, code: string) =>
  r.quests.find((q) => q.code === code);
const catalog = { achievements: ACHIEVEMENTS, quests: MISSIONS };

/** A sync as the client sees it: the feedback for the state before and after. */
async function syncAndTell(store: ReturnType<typeof memoryStore>, d: RewardData) {
  const before = structuredClone(store.state);
  const outcome = await syncRewardsWith(store, d, { revoke: true });
  return rewardFeedback(before, outcome.state, outcome.result, catalog, 0, d.now);
}

describe("mission progress", () => {
  it("log today and look at today are separate daily steps", () => {
    const r = calculateRewards({ ...data([logged(day(11))], all()), ...facts });
    expect(mission(r, "log_today")).toMatchObject({ periodKey: TODAY, complete: true });
    expect(mission(r, "review_today")).toMatchObject({ progress: 0, complete: false });
    const reviewed = calculateRewards({ ...data([], all()), ...facts, reviewedDays: [TODAY] });
    expect(mission(reviewed, "review_today")).toMatchObject({ progress: 1, complete: true });
    // Yesterday's look doesn't count for today.
    const old = calculateRewards({ ...data([], all()), ...facts, reviewedDays: ["2026-11-10"] });
    expect(mission(old, "review_today")?.complete).toBe(false);
  });

  it("moving money to a goal counts this week, at any amount", () => {
    const lastWeek = allocate(100, LAPTOP_GOAL, { occurredAt: day(6) });
    const r1 = calculateRewards({ ...data([lastWeek], all()), ...facts });
    expect(mission(r1, "set_aside_week")?.complete).toBe(false);
    const tiny = allocate(100, LAPTOP_GOAL, { occurredAt: day(10) });
    const r2 = calculateRewards({ ...data([lastWeek, tiny], all()), ...facts });
    expect(mission(r2, "set_aside_week")).toMatchObject({
      periodKey: "2026-11-09",
      complete: true,
    });
  });

  it("long-term missions count days and weeks, and never pass their target", () => {
    const days = Array.from({ length: 7 }, (_, i) => logged(day(i + 1)));
    const r = calculateRewards({ ...data(days, all()), ...facts });
    expect(mission(r, "steady_logging")).toMatchObject({
      progress: 7,
      target: 20,
      complete: false,
    });

    const many = Array.from({ length: 25 }, (_, i) =>
      logged(ist(`2026-10-${String(i + 1).padStart(2, "0")}`)),
    );
    const done = calculateRewards({ ...data(many, all()), ...facts });
    expect(mission(done, "steady_logging")).toMatchObject({ progress: 20, complete: true });
    expect(done.events.map((e) => e.sourceKey)).toContain("quest:steady_logging:once");

    const weeks = [1, 8, 15, 22].map((d) =>
      allocate(100, LAPTOP_GOAL, { occurredAt: ist(`2026-10-${String(d).padStart(2, "0")}`) }),
    );
    const saving = calculateRewards({ ...data(weeks.slice(0, 3), all()), ...facts });
    expect(mission(saving, "saving_habit")).toMatchObject({ progress: 3, complete: false });
    const habit = calculateRewards({ ...data(weeks, all()), ...facts });
    expect(mission(habit, "saving_habit")?.complete).toBe(true);
  });

  it("several entries the same day are one day of the habit", () => {
    const sameDay = Array.from({ length: 30 }, () => logged(day(5)));
    const r = calculateRewards({ ...data(sameDay, all()), ...facts });
    expect(mission(r, "steady_logging")?.progress).toBe(1);
  });

  it("a long-term mission follows the entries: deleting a day steps it back", async () => {
    const store = memoryStore();
    const days = Array.from({ length: 20 }, (_, i) =>
      logged(ist(`2026-10-${String(i + 1).padStart(2, "0")}`)),
    );
    await syncRewardsWith(store, data(days, all()), { revoke: true });
    expect(store.state.events.some((e) => e.sourceKey === "quest:steady_logging:once")).toBe(true);
    const back = await syncRewardsWith(store, data(days.slice(1), all()), { revoke: true });
    const award = back.state.events.find((e) => e.sourceKey === "quest:steady_logging:once");
    expect(award?.revokedAt).not.toBeNull();
    expect(back.state.quests.find((q) => q.questCode === "steady_logging")).toMatchObject({
      progress: 19,
      completedAt: null,
    });
  });

  it("no mission rewards spending or the amount", () => {
    const small = calculateRewards({ ...data([logged(day(11), {}, 100)], all()), ...facts });
    const big = calculateRewards({ ...data([logged(day(11), {}, 50_00_000)], all()), ...facts });
    expect(small.quests).toEqual(big.quests);
    expect(totalXp(small.events)).toBe(totalXp(big.events));
  });

  it("a skipped mission isn't worked out at all", () => {
    const r = calculateRewards({
      ...data([logged(day(11))], all()),
      ...facts,
      optedOutQuests: ["log_today"],
    });
    expect(mission(r, "log_today")).toBeUndefined();
    expect(r.events.some((e) => e.sourceKey.startsWith("quest:log_today"))).toBe(false);
  });
});

describe("achievement progress", () => {
  it("shows how far along each one is, by its own rule", () => {
    const four = Array.from({ length: 4 }, (_, i) => logged(day(i + 1)));
    const r = calculateRewards({ ...data(four), ...facts, insightsExplored: 2 });
    const progress = Object.fromEntries(r.achievementProgress.map((p) => [p.code, p]));
    expect(progress.first_10_transactions).toMatchObject({ progress: 4, target: 10 });
    expect(progress.streak_7_day).toMatchObject({ progress: 4, target: 7 });
    expect(progress.spending_detective).toMatchObject({ progress: 2, target: 5 });
    expect(progress.weekly_review_complete).toMatchObject({ progress: 0, target: 1 });
    // 2–4 Nov is a finished week with every expense categorised: that one is earned.
    expect(progress.no_mystery_money).toMatchObject({ progress: 1, target: 1 });
    expect(r.achievementCodes).toEqual(["no_mystery_money"]);
  });

  it("is capped at the target", () => {
    const many = Array.from({ length: 40 }, () => logged(day(3)));
    const r = calculateRewards({ ...data(many), ...facts });
    expect(r.achievementProgress.find((p) => p.code === "first_10_transactions")).toMatchObject({
      progress: 10,
      target: 10,
    });
  });
});

describe("feedback after a save", () => {
  it("a first entry: a quiet XP line for the day, then the mission it completed", async () => {
    const store = memoryStore();
    const f = await syncAndTell(store, data([logged(day(11))], all()));
    expect(f.routineXp).toBe(XP.loggedDay);
    expect(f.routineReasons).toEqual(["Logged today"]);
    // A categorised entry also clears this week's queue: two missions, in one notice.
    expect(f.missionsCompleted.map((m) => m.code)).toEqual(["log_today", "categorise_week"]);
    expect(f.achievements).toEqual([]);
    expect(f.status.xp).toBe(XP.loggedDay + 5 + 20);
  });

  it("a second entry the same day earns nothing, so there's nothing to show", async () => {
    const store = memoryStore();
    await syncAndTell(store, data([logged(day(11))], all()));
    const f = await syncAndTell(store, data([logged(day(11)), logged(day(11))], all()));
    expect(hasFeedback(f)).toBe(false);
  });

  it("a long mission's step shows as progress, not as a completion", async () => {
    const store = memoryStore();
    await syncAndTell(store, data([logged(day(10))], all()));
    const f = await syncAndTell(store, data([logged(day(10)), logged(day(11))], all()));
    expect(f.progress).toEqual([
      { code: "steady_logging", title: "steady_logging", progress: 2, target: 20 },
    ]);
  });

  it("an achievement is reported once", async () => {
    const store = memoryStore();
    const nine = Array.from({ length: 9 }, (_, i) => logged(day(i + 1)));
    await syncAndTell(store, data(nine, all()));
    const f = await syncAndTell(store, data([...nine, logged(day(10))], all()));
    expect(f.achievements.map((a) => a.code)).toEqual(["first_10_transactions"]);
    const again = await syncAndTell(store, data([...nine, logged(day(10))], all()));
    expect(hasFeedback(again)).toBe(false);
  });

  it("crossing a level threshold is a level-up; staying inside a level isn't", () => {
    const event = (sourceKey: string, xp: number) => ({
      sourceKey,
      kind: "logged_day",
      xp,
      createdAt: day(1),
      revokedAt: null,
    });
    const state = (xps: number[]): RewardState => ({
      events: xps.map((xp, i) => event(`logged_day:k${i}`, xp)),
      achievements: [],
      quests: [],
    });
    const result = calculateRewards({ ...data([]), ...facts });
    const up = rewardFeedback(state([90]), state([90, 20]), result, catalog, 0, 0);
    expect(up.levelUp).toEqual({ from: 1, to: 2, rank: "Starter", rankChanged: false });
    const rank = rewardFeedback(state([290]), state([290, 20]), result, catalog, 0, 0);
    expect(rank.levelUp).toEqual({ from: 2, to: 3, rank: "Tracker", rankChanged: true });
    const same = rewardFeedback(state([100]), state([100, 20]), result, catalog, 0, 0);
    expect(same.levelUp).toBeNull();
  });

  it("an award earned and taken back within one comparison shows nothing", async () => {
    const store = memoryStore();
    const before = structuredClone(store.state);
    await syncRewardsWith(store, data([logged(day(11))], all()), { revoke: true });
    const outcome = await syncRewardsWith(store, data([], all()), { revoke: true });
    const f = rewardFeedback(before, outcome.state, outcome.result, catalog, 0, 0);
    expect(f.routineXp).toBe(0);
    expect(f.missionsCompleted).toEqual([]);
  });

  it("an award restored after an Undo shows again, once, with the same XP", async () => {
    const store = memoryStore();
    await syncAndTell(store, data([logged(day(11))], all()));
    await syncAndTell(store, data([], all()));
    const f = await syncAndTell(store, data([logged(day(11))], all()));
    expect(f.routineXp).toBe(XP.loggedDay);
    expect(store.state.events.filter((e) => e.sourceKey === `logged_day:${TODAY}`)).toHaveLength(1);
  });
});

describe("no duplicate XP", () => {
  const entry = logged(day(11));

  it("on retry: the same sync twice awards once", async () => {
    const store = memoryStore();
    await syncRewardsWith(store, data([entry], all()), { revoke: true });
    const xp = totalXp(store.state.events);
    await syncRewardsWith(store, data([entry], all()), { revoke: true });
    expect(totalXp(store.state.events)).toBe(xp);
    expect(new Set(store.state.events.map((e) => e.sourceKey)).size).toBe(
      store.state.events.length,
    );
  });

  it("on edit: a new amount, description or date earns nothing new", async () => {
    const store = memoryStore();
    await syncRewardsWith(store, data([entry], all()), { revoke: true });
    const xp = totalXp(store.state.events);
    const edited = {
      ...entry,
      amountPaise: 99_999,
      description: "Chai",
      updatedAt: day(11, "13:00"),
    };
    await syncRewardsWith(store, data([edited], all()), { revoke: true });
    expect(totalXp(store.state.events)).toBe(xp);
    // Moving the date back and forth can't earn a week twice either.
    for (const occurredAt of [day(3), day(10), day(3), day(10)]) {
      await syncRewardsWith(store, data([{ ...edited, occurredAt }], all()), { revoke: true });
      expect(totalXp(store.state.events)).toBeLessThanOrEqual(xp);
    }
    expect(totalXp(store.state.events)).toBe(xp);
    expect(new Set(store.state.events.map((e) => e.sourceKey)).size).toBe(
      store.state.events.length,
    );
  });

  it("on delete and undo, over and over: never more than the first time", async () => {
    const store = memoryStore();
    await syncRewardsWith(store, data([entry], all()), { revoke: true });
    const xp = totalXp(store.state.events);
    const rows = store.state.events.length;
    for (let i = 0; i < 4; i += 1) {
      await syncRewardsWith(store, data([], all()), { revoke: true });
      expect(totalXp(store.state.events)).toBe(0);
      await syncRewardsWith(store, data([logged(day(11))], all()), { revoke: true });
      expect(totalXp(store.state.events)).toBe(xp);
    }
    expect(store.state.events).toHaveLength(rows);
  });
});

describe("a sync that an Undo lands in the middle of", () => {
  const stamp = (id: string, updatedAt: string, deletedAt: string | null = null): LedgerStamp => ({
    id,
    updatedAt,
    deletedAt,
  });

  it("knows when the ledger moved after it was read", () => {
    const tea = logged(day(11, "10:00"));
    expect(ledgerChanged([tea], [stamp(tea.id, tea.updatedAt)])).toBe(false);
    expect(ledgerChanged([tea], [stamp(tea.id, day(11, "10:01"), day(11, "10:01"))])).toBe(true);
    expect(ledgerChanged([tea], [stamp(tea.id, day(11, "10:05"))])).toBe(true);
    expect(ledgerChanged([], [stamp("new", day(11))])).toBe(true);
    // Deleted before the read: not in the snapshot, nothing changed since.
    expect(ledgerChanged([], [stamp("gone", day(11), day(11))])).toBe(false);
    expect(ledgerChanged([tea], [])).toBe(false);
  });

  it("runs again after the delete, so the save's award doesn't linger", async () => {
    const store = memoryStore();
    const tea = logged(day(11));
    // Pass 1 reads the ledger with the entry; the Undo deletes it before the check.
    const ledgers = [[tea], []];
    const result = await settleRewardSync(
      store,
      async (pass) => data(ledgers[Math.min(pass, 2) - 1]!, all()),
      async () => [stamp(tea.id, day(11, "12:01"), day(11, "12:01"))],
      { revoke: true },
    );
    expect(result.passes).toBe(2);
    expect(totalXp(store.state.events)).toBe(0);
    const f = rewardFeedback(
      result.before,
      result.outcome.state,
      result.outcome.result,
      catalog,
      0,
      0,
    );
    expect(hasFeedback(f)).toBe(false);
  });

  it("stale save sync after the Undo's sync: the second pass takes it back", async () => {
    // The save's sync read the ledger first; the Undo and its own sync finished meanwhile; the
    // save's sync then writes the award. Without a second pass the XP would stay.
    const store = memoryStore();
    const tea = logged(day(11));
    let deleted = false;
    const load = async (pass: number): Promise<RewardData> => {
      if (pass === 1) {
        const d = data([tea], all());
        // The Undo happens here, while the save's sync is still working.
        deleted = true;
        await syncRewardsWith(store, data([], all()), { revoke: true });
        return d;
      }
      return data(deleted ? [] : [tea], all());
    };
    const result = await settleRewardSync(
      store,
      load,
      async () => (deleted ? [stamp(tea.id, day(11, "12:01"), day(11, "12:01"))] : []),
      { revoke: true },
    );
    expect(result.passes).toBe(2);
    expect(totalXp(store.state.events)).toBe(0);
    expect(store.state.quests.find((q) => q.questCode === "log_today")?.completedAt).toBeNull();
  });

  it("stops after three passes even if the ledger keeps moving", async () => {
    const store = memoryStore();
    const result = await settleRewardSync(
      store,
      async () => data([], all()),
      async () => [stamp("x", day(11))],
      { revoke: true },
    );
    expect(result.passes).toBe(3);
  });

  it("a quiet ledger is one pass", async () => {
    const store = memoryStore();
    const state: RewardState = structuredClone(store.state);
    const result = await settleRewardSync(
      store,
      async () => data([logged(day(11))], all()),
      async () => [],
      { revoke: true },
    );
    expect(result.passes).toBe(1);
    expect(result.before).toEqual(state);
  });
});

describe("logging never costs XP (spec: don't punish expenses)", () => {
  const sortedTea = logged(day(10));
  const mystery = () => logged(day(11), { categoryId: null });
  const sortKey = `quest:categorise_week:2026-11-09`;
  const sortMission = (store: ReturnType<typeof memoryStore>) =>
    store.state.quests.find((q) => q.questCode === "categorise_week");

  it("an uncategorised entry after the week was sorted keeps the mission done, with a hint", async () => {
    const store = memoryStore();
    await syncRewardsWith(store, data([sortedTea], all()), { revoke: false });
    const xp = totalXp(store.state.events);
    expect(store.state.events.some((e) => e.sourceKey === sortKey)).toBe(true);

    const outcome = await syncRewardsWith(store, data([sortedTea, mystery()], all()), {
      revoke: false,
    });
    expect(totalXp(store.state.events)).toBeGreaterThanOrEqual(xp);
    expect(store.state.events.find((e) => e.sourceKey === sortKey)?.revokedAt).toBeNull();
    expect(sortMission(store)?.completedAt).not.toBeNull();
    expect(outcome.result.quests.find((q) => q.code === "categorise_week")).toMatchObject({
      complete: true,
      toSort: 1,
    });
  });

  it("a later, unrelated delete doesn't take the sorted week back either", async () => {
    const store = memoryStore();
    const other = logged(day(9));
    await syncRewardsWith(store, data([sortedTea, other], all()), { revoke: false });
    await syncRewardsWith(store, data([sortedTea, other, mystery()], all()), { revoke: false });
    await syncRewardsWith(store, data([sortedTea, mystery()], all()), { revoke: true });
    const award = store.state.events.find((e) => e.sourceKey === sortKey);
    expect(award?.revokedAt).toBeNull();
    expect(sortMission(store)?.completedAt).not.toBeNull();
  });

  it("a week that was never sorted isn't counted as sorted", () => {
    const r = calculateRewards({
      ...data([mystery()], all()),
      ...facts,
      keptKeys: new Set(),
    });
    expect(mission(r, "categorise_week")).toMatchObject({ complete: false, toSort: 1 });
  });

  it("a past sorted week keeps its bonus when an uncategorised entry is backdated into it", async () => {
    const week = Array.from({ length: 5 }, (_, i) => logged(day(2 + i)));
    const store = memoryStore();
    await syncRewardsWith(store, data(week, all()), { revoke: false });
    const key = "clean_week:2026-11-02";
    expect(store.state.events.some((e) => e.sourceKey === key)).toBe(true);
    const late = logged(day(11), { categoryId: null, occurredAt: day(4) });
    await syncRewardsWith(store, data([...week, late], all()), { revoke: true });
    expect(store.state.events.find((e) => e.sourceKey === key)?.revokedAt).toBeNull();
  });

  it("a sync after a save takes nothing back, so XP can only go up", async () => {
    const store = memoryStore();
    await syncRewardsWith(store, data([logged(day(11))], all()), { revoke: false });
    const xp = totalXp(store.state.events);
    const plan = await syncRewardsWith(store, data([], all()), { revoke: false });
    expect(totalXp(plan.state.events)).toBe(xp);
    expect(store.state.quests.find((q) => q.questCode === "log_today")?.completedAt).not.toBeNull();
  });

  it("an edit that moves the entry off its day still takes that day back (no farming)", async () => {
    const store = memoryStore();
    const entry = logged(day(11));
    await syncRewardsWith(store, data([entry], all()), { revoke: false });
    const xp = totalXp(store.state.events);
    for (const occurredAt of [day(3), day(10), day(3)]) {
      await syncRewardsWith(store, data([{ ...entry, occurredAt }], all()), { revoke: true });
      expect(totalXp(store.state.events)).toBeLessThanOrEqual(xp);
    }
  });

  it("an edit landing mid-sync never lets it take anything back; a delete does", () => {
    const tea = logged(day(11, "10:00"));
    const stamp = (id: string, updatedAt: string, deletedAt: string | null = null) => ({
      id,
      updatedAt,
      deletedAt,
    });
    expect(ledgerRemoved([tea], [stamp("new", day(11, "10:05"))])).toBe(false);
    expect(ledgerRemoved([tea], [stamp(tea.id, day(11, "10:05"))])).toBe(false);
    expect(ledgerRemoved([tea], [stamp(tea.id, day(11, "10:05"), day(11, "10:05"))])).toBe(true);
  });

  it("a save's sync that an Undo lands in still takes the award back on its next pass", async () => {
    const store = memoryStore();
    const tea = logged(day(11));
    let deleted = false;
    const load = async (pass: number): Promise<RewardData> => {
      if (pass === 1) {
        const d = data([tea], all());
        deleted = true;
        await syncRewardsWith(store, data([], all()), { revoke: true });
        return d;
      }
      return data(deleted ? [] : [tea], all());
    };
    const result = await settleRewardSync(
      store,
      load,
      async () =>
        deleted ? [{ id: tea.id, updatedAt: day(11, "12:01"), deletedAt: day(11, "12:01") }] : [],
      { revoke: false },
    );
    expect(result.passes).toBe(2);
    expect(totalXp(store.state.events)).toBe(0);
  });
});

describe("edits never cost XP; only a delete or an Undo does", () => {
  it("only a delete or an Undo may take XP back", () => {
    for (const kind of ["create", "batch", "update", "restore", "goal_move", "pay_commitment"])
      expect(revokesRewards(kind)).toBe(false);
    expect(revokesRewards("delete")).toBe(true);
    expect(revokesRewards("undo_batch")).toBe(true);
  });

  it("changing category, amount, note, merchant or date keeps every award, a budget month too", async () => {
    const october = Array.from({ length: 5 }, (_, i) =>
      logged(ist(`2026-10-${String(i + 12)}`), {}, 1_000),
    );
    const budget = {
      ...budgetSchema.parse({ id: id(700), ownerId: OWNER, limitPaise: 10_000 }),
      createdAt: ist("2026-10-01"),
    };
    const withBudget = (rows: typeof october) => data(rows, all({ budgets: [budget] }));
    const store = memoryStore();
    await syncRewardsWith(store, withBudget(october), { revoke: false });
    const monthKey = "budget_month:2026-10";
    expect(store.state.events.some((e) => e.sourceKey === monthKey)).toBe(true);
    const xp = totalXp(store.state.events);
    const days = loggedDays(october, "Asia/Kolkata");

    const [first, ...rest] = october;
    const edits = [
      { categoryId: null },
      { amountPaise: 50_000 }, // now well over the month's budget
      { note: "late lunch" },
      { merchant: "Canteen" },
      { occurredAt: ist("2026-10-01") },
    ];
    for (const patch of edits) {
      const edited = { ...first!, ...patch, updatedAt: day(11, "15:00") };
      await syncRewardsWith(store, withBudget([edited, ...rest]), {
        revoke: revokesRewards("update"),
      });
      expect(totalXp(store.state.events)).toBe(xp);
      expect(store.state.events.find((e) => e.sourceKey === monthKey)?.revokedAt).toBeNull();
      // A day is counted by when the entry was logged, which no edit changes.
      expect(loggedDays([edited, ...rest], "Asia/Kolkata")).toEqual(days);
    }
  });
});
