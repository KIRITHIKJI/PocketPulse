import {
  type ExpenseTransaction,
  type RefundTransaction,
  type SafeToSpendResult,
  type SurvivalInput,
  budgetAlert,
  budgetSchema,
  calculatePlan,
  calculateSafeToSpend,
  dueOccurrences,
  evaluateBudget,
  firstOccurrenceOnOrAfter,
  followingIncomeDate,
  forecastCommitments,
  goalForecast,
  goalMoves,
  goalProgress,
  isScheduledOn,
  newlyReachedThresholds,
  nthOccurrence,
  proposedNextIncomeDate,
  purchaseGroupKey,
  purchaseGroups,
  recurringTemplateSchema,
  releaseFromSaved,
  repeatInsightText,
  resolvePeriod,
  survivalPlan,
  whatIf,
  whatIfText,
  formatMoney,
  indexById,
} from "@/domain";

import {
  CASH,
  LAPTOP_GOAL,
  OWNER,
  account,
  allocate,
  commitment,
  expense,
  goal,
  id,
  income,
  ist,
  istMs,
  release,
  refund,
} from "./fixtures";

const TZ = "Asia/Kolkata";
const settings = { timeZone: TZ, weekStartsOn: 1 as const };
const NOW = istMs("2026-11-10");
const money = (paise: number) => formatMoney(paise, { currency: "INR" });

const template = (overrides: Record<string, unknown> = {}) =>
  recurringTemplateSchema.parse({
    id: id(800),
    ownerId: OWNER,
    kind: "expense",
    title: "Rent",
    amountPaise: 50_000,
    cadence: "monthly",
    anchorDate: "2026-11-15",
    nextDueDate: "2026-11-15",
    ...overrides,
  });

describe("recurring schedules", () => {
  it("counts months from the anchor, so a 31st comes back after a short month", () => {
    const t = template({ anchorDate: "2027-01-31", nextDueDate: "2027-01-31" });
    expect([0, 1, 2, 3].map((n) => nthOccurrence(t, n))).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
    ]);
  });

  it("handles daily, weekly, every-two-weeks and yearly, and leap days", () => {
    expect(nthOccurrence(template({ cadence: "daily" }), 3)).toBe("2026-11-18");
    expect(nthOccurrence(template({ cadence: "weekly", intervalCount: 2 }), 2)).toBe("2026-12-13");
    const leap = template({ cadence: "yearly", anchorDate: "2028-02-29" });
    expect(nthOccurrence(leap, 1)).toBe("2029-02-28");
    expect(nthOccurrence(leap, 4)).toBe("2032-02-29");
  });

  it("knows which dates are on the schedule, and stops at the end date", () => {
    const t = template({ endDate: "2027-01-15" });
    expect(isScheduledOn(t, "2026-12-15")).toBe(true);
    expect(isScheduledOn(t, "2026-12-16")).toBe(false);
    expect(isScheduledOn(t, "2027-02-15")).toBe(false);
    expect(firstOccurrenceOnOrAfter(t, "2026-12-16")).toBe("2027-01-15");
    expect(firstOccurrenceOnOrAfter(t, "2027-01-16")).toBeNull();
  });

  it("lists what's due, minus recorded and skipped occurrences", () => {
    const t = template();
    const recorded = expense(50_000, {});
    const tx = { ...recorded, recurringTemplateId: t.id, recurringOccurrence: "2026-11-15" };
    const skip = {
      ...commitment(50_000, "2026-12-15", { cancelledAt: ist("2026-11-01") }),
      recurringTemplateId: t.id,
      recurringOccurrence: "2026-12-15",
    };
    const dates = (ledger: never[] | [typeof tx], skips: (typeof skip)[]) =>
      dueOccurrences(t, ledger, skips, "2027-01-20").map((d) => d.occurrence);
    expect(dates([], [])).toEqual(["2026-11-15", "2026-12-15", "2027-01-15"]);
    expect(dates([tx], [])).toEqual(["2026-12-15", "2027-01-15"]);
    expect(dates([tx], [skip])).toEqual(["2027-01-15"]);
    // A deleted entry no longer holds the occurrence: it's due again.
    expect(dates([{ ...tx, deletedAt: ist("2026-11-16") }], [])).toContain("2026-11-15");
  });

  it("forecasts nothing while paused or archived, and stays bounded", () => {
    const paused = template({ pausedAt: ist("2026-11-01") });
    expect(dueOccurrences(paused, [], [], "2027-12-31")).toEqual([]);
    const archived = template({ archivedAt: ist("2026-11-01") });
    expect(dueOccurrences(archived, [], [], "2027-12-31")).toEqual([]);
    const old = template({ cadence: "daily", anchorDate: "2020-01-01", nextDueDate: "2026-11-01" });
    const due = dueOccurrences(old, [], [], "2026-11-10");
    expect(due[0]?.occurrence).toBe("2026-11-01");
    expect(due).toHaveLength(10);
  });

  it("only expenses become forecast bills; expected income never counts", () => {
    const rows = forecastCommitments(
      [template(), template({ id: id(801), kind: "income" })],
      [],
      [],
      "2026-11-30",
    );
    expect(rows.map((c) => c.title)).toEqual(["Rent"]);
    expect(rows[0]).toMatchObject({ dueDate: "2026-11-15", paidTransactionId: null });
  });
});

describe("the plan: safe-to-spend from bills and recurring items", () => {
  const accounts = [account(CASH, 1_000_000)];
  const base = { accounts, ledger: [], commitments: [], templates: [], now: NOW, settings };

  it("subtracts a bill and a recurring expense inside the horizon, one list", () => {
    const r = calculatePlan({
      ...base,
      commitments: [commitment(100_000, "2026-11-20"), commitment(99_000, "2026-12-20")],
      templates: [template()],
      nextIncomeDate: "2026-12-01",
    });
    expect(r.inputs.commitmentsDuePaise).toBe(150_000);
    expect(r.flexiblePaise).toBe(850_000);
    expect(r.daysUntilNextIncome).toBe(21);
    expect(r.suggestedDailyPaise).toBe(40_476);
  });

  it("without commitments it's balance minus savings, and the balance is untouched by savings", () => {
    const ledger = [allocate(200_000)];
    const r = calculatePlan({ ...base, ledger, nextIncomeDate: "2026-12-01" });
    expect(r.inputs.balancePaise).toBe(1_000_000);
    expect(r.flexiblePaise).toBe(800_000);
  });

  it.each([
    ["no date at all", null],
    ["a date already passed", "2026-11-01"],
    ["today", "2026-11-10"],
  ])("never invents a limit with %s", (_, nextIncomeDate) => {
    const r = calculatePlan({ ...base, templates: [template()], nextIncomeDate });
    expect(r.status).toBe("not_enough_info");
    expect(r.suggestedDailyPaise).toBeNull();
    expect(r.suggestedWeeklyPaise).toBeNull();
    expect(r.daysUntilNextIncome).toBeNull();
    expect(r.expectedEndBalancePaise).toBeNull();
    // What's known is still shown: the next 30 days of bills are subtracted.
    expect(r.inputs.commitmentsDuePaise).toBe(50_000);
  });

  it("a paid bill is counted once: in the balance, not as unpaid", () => {
    const paid = expense(100_000);
    const planned = calculatePlan({
      ...base,
      commitments: [commitment(100_000, "2026-11-20")],
      nextIncomeDate: "2026-12-01",
    });
    const done = calculatePlan({
      ...base,
      ledger: [paid],
      commitments: [commitment(100_000, "2026-11-20", { paidTransactionId: paid.id })],
      nextIncomeDate: "2026-12-01",
    });
    expect(done.inputs.commitmentsDuePaise).toBe(0);
    expect(done.inputs.balancePaise).toBe(900_000);
    expect(done.flexiblePaise).toBe(planned.flexiblePaise);
  });

  it("skip markers aren't bills", () => {
    const skip = {
      ...commitment(50_000, "2026-11-15", { cancelledAt: ist("2026-11-02") }),
      recurringTemplateId: id(800),
      recurringOccurrence: "2026-11-15",
    };
    const r = calculatePlan({
      ...base,
      commitments: [skip],
      templates: [template()],
      nextIncomeDate: "2026-12-01",
    });
    expect(r.inputs.commitmentsDuePaise).toBe(0);
  });

  it("explains in the profile's currency and with readable dates", () => {
    const r = calculateSafeToSpend({
      ...base,
      nextIncomeDate: "2026-12-01",
      money: (p) => formatMoney(p, { currency: "USD" }),
      dateText: () => "1 Dec 2026",
    });
    expect(r.explanation.join(" ")).toContain("$");
    expect(r.explanation.join(" ")).not.toContain("₹");
    expect(r.explanation.join(" ")).toContain("1 Dec 2026");
    expect(r.explanation.join(" ")).not.toContain("2026-12-01");
  });

  it("warns when the recent pace runs out before the next income", () => {
    const ledger = Array.from({ length: 14 }, (_, i) =>
      expense(200_000, { occurredAt: ist(`2026-10-${String(27 + (i % 4)).padStart(2, "0")}`) }),
    );
    const r = calculatePlan({
      ...base,
      accounts: [account(CASH, 3_000_000)],
      ledger,
      nextIncomeDate: "2026-12-01",
    });
    expect(r.runOutInDays).not.toBeNull();
    expect(r.warnings.join(" ")).toMatch(/recent pace/);
  });
});

describe("income dates", () => {
  it("steps by the saved frequency", () => {
    expect(followingIncomeDate("2026-11-01", "weekly")).toBe("2026-11-08");
    expect(followingIncomeDate("2026-11-01", "biweekly")).toBe("2026-11-15");
    expect(followingIncomeDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(followingIncomeDate("2026-11-01", "irregular")).toBeNull();
    expect(followingIncomeDate("2026-11-01", "none")).toBeNull();
  });

  it("proposes the next regular date after today, and nothing for irregular income", () => {
    expect(proposedNextIncomeDate("2026-09-01", "monthly", "2026-11-10")).toBe("2026-12-01");
    expect(proposedNextIncomeDate("2026-11-01", "weekly", "2026-11-08")).toBe("2026-11-15");
    expect(proposedNextIncomeDate("2026-11-01", "irregular", "2026-11-10")).toBeNull();
  });
});

describe("Survival Mode", () => {
  const accounts = [account(CASH, 1_000_000)];
  const calc = (o: Partial<Parameters<typeof calculatePlan>[0]> = {}): SafeToSpendResult =>
    calculatePlan({
      accounts,
      ledger: [],
      commitments: [],
      templates: [],
      now: NOW,
      settings,
      nextIncomeDate: "2026-12-01",
      ...o,
    });
  const plan = (result: SafeToSpendResult, o: Partial<SurvivalInput> = {}) =>
    survivalPlan({
      result,
      frequency: "monthly",
      expectedIncomePaise: null,
      ledger: [],
      now: NOW,
      settings,
      money,
      ...o,
    });

  it("shares every limit with Safe to spend", () => {
    const result = calc();
    const p = plan(result);
    expect(p.dailyAllowancePaise).toBe(result.suggestedDailyPaise);
    expect(p.weeklyAllowancePaise).toBe(result.suggestedWeeklyPaise);
    expect(p.daysLeft).toBe(result.daysUntilNextIncome);
  });

  it("asks for a date and shows no allowance when there isn't one", () => {
    const p = plan(calc({ nextIncomeDate: null }));
    expect(p).toMatchObject({ status: "needs_date", dailyAllowancePaise: null, cycle: null });
  });

  it("is on track when the recent pace fits", () => {
    const ledger = [expense(70_000, { occurredAt: ist("2026-11-05") })];
    expect(plan(calc({ ledger }), { ledger }).status).toBe("on_track");
  });

  it("says when there's no pace to compare with yet", () => {
    const fresh = [account(CASH, 1_000_000, "2026-11-10")];
    expect(plan(calc({ accounts: fresh })).status).toBe("too_early");
  });

  it("is gentle about a big day, and clear when money may run short", () => {
    const today = [expense(200_000, { occurredAt: ist("2026-11-10", "09:00") })];
    const big = plan(calc({ ledger: today }), { ledger: today });
    expect(big.status).toBe("watch");

    const heavy = Array.from({ length: 4 }, (_, i) =>
      expense(200_000, { occurredAt: ist(`2026-11-0${i + 5}`) }),
    );
    const risky = plan(calc({ ledger: heavy }), { ledger: heavy });
    expect(risky.status).toBe("at_risk");
    expect(`${risky.headline} ${risky.detail}`).not.toMatch(/\b(fail|bad|overspent|must)\b/i);

    const empty = plan(calc({ accounts: [account(CASH, 0)] }));
    expect(empty.status).toBe("at_risk");
    expect(empty.dailyAllowancePaise).toBe(0);
  });

  it("builds the allowance period from the saved frequency", () => {
    const ledger = [
      expense(5_000, { occurredAt: ist("2026-11-02") }),
      expense(7_000, { occurredAt: ist("2026-10-31") }),
    ];
    const p = plan(calc({ ledger }), { ledger, expectedIncomePaise: 400_000 });
    expect(p.cycle).toEqual({
      startDate: "2026-11-01",
      nextIncomeDate: "2026-12-01",
      dayNumber: 10,
      lengthDays: 30,
      spentPaise: 5_000,
      expectedIncomePaise: 400_000,
    });
    const weekly = plan(calc({ nextIncomeDate: "2026-11-14" }), { frequency: "weekly" });
    expect(weekly.cycle).toMatchObject({ startDate: "2026-11-07", dayNumber: 4, lengthDays: 7 });
    expect(plan(calc(), { frequency: "irregular" }).cycle).toBeNull();
  });

  it("shows no cycle when the next date is more than a period away", () => {
    expect(plan(calc({ nextIncomeDate: "2027-02-01" })).cycle).toBeNull();
  });
});

describe("budget alerts and pace", () => {
  const budget = (o: Record<string, unknown> = {}) =>
    budgetSchema.parse({ id: id(700), ownerId: OWNER, limitPaise: 100_000, ...o });

  it("shows the highest threshold reached, and only while it's reached", () => {
    const entry = expense(85_000, { occurredAt: ist("2026-11-02") });
    const at = evaluateBudget(budget(), [entry], NOW, settings);
    expect(budgetAlert(at)).toMatchObject({ thresholdBp: 8_000, usedBp: 8_500, exceeded: false });
    // Editing the entry down takes the alert away.
    const edited = { ...entry, amountPaise: 10_000 };
    expect(budgetAlert(evaluateBudget(budget(), [edited], NOW, settings))).toBeNull();
    const over = evaluateBudget(budget(), [{ ...entry, amountPaise: 120_000 }], NOW, settings);
    expect(budgetAlert(over)).toMatchObject({ thresholdBp: 10_000, exceeded: true });
  });

  it("uses thresholds the user chose, or none", () => {
    const entry = expense(30_000, { occurredAt: ist("2026-11-02") });
    const custom = evaluateBudget(budget({ alertThresholdsBp: [2_500] }), [entry], NOW, settings);
    expect(budgetAlert(custom)?.thresholdBp).toBe(2_500);
    const off = evaluateBudget(budget({ alertThresholdsBp: [] }), [entry], NOW, settings);
    expect(budgetAlert(off)).toBeNull();
  });

  it("is exactly at the boundary at 100 %", () => {
    const entry = expense(100_000, { occurredAt: ist("2026-11-02") });
    const r = evaluateBudget(budget(), [entry], NOW, settings);
    expect(r.remainingPaise).toBe(0);
    expect(r.status).not.toBe("exceeded");
    expect(r.reachedThresholdsBp).toContain(10_000);
  });

  it("recalculates for a refund and reports each newly crossed threshold once", () => {
    const entry = expense(90_000, { occurredAt: ist("2026-11-02") });
    const before = evaluateBudget(budget(), [entry], NOW, settings);
    const after = evaluateBudget(
      budget(),
      [entry, expense(20_000, { occurredAt: ist("2026-11-03") })],
      NOW,
      settings,
    );
    expect(newlyReachedThresholds(before, after)).toEqual([10_000]);
    const refunded = evaluateBudget(
      budget(),
      [entry, refund(50_000, entry.id, { occurredAt: ist("2026-11-04") })],
      NOW,
      settings,
    );
    expect(refunded.spentPaise).toBe(40_000);
  });

  it("says target, not reserved money, in its explanation, in the right currency", () => {
    const usd = (p: number) => formatMoney(p, { currency: "USD" });
    const r = evaluateBudget(budget(), [], NOW, settings, undefined, usd);
    expect(r.explanation).toContain("target, not reserved money");
    expect(r.explanation).toContain("$");
    expect(r.explanation).not.toContain("₹");
  });
});

describe("goals", () => {
  const today = "2026-11-10";

  it("counts allocations minus releases, with a suggestion to the target date", () => {
    const g = goal(LAPTOP_GOAL, 100_000, "2026-12-08");
    const ledger = [allocate(40_000), release(10_000), allocate(10_000)];
    const p = goalProgress(g, ledger, today);
    expect(p).toMatchObject({ savedPaise: 40_000, remainingPaise: 60_000, progressBp: 4_000 });
    expect(p.suggested).toEqual({ cadence: "weekly", amountPaise: 15_000, periods: 4 });
    expect(goalProgress(g, ledger, today, "monthly").suggested?.periods).toBe(1);
  });

  it("completes at the target, not before", () => {
    const g = goal(LAPTOP_GOAL, 100_000);
    expect(goalProgress(g, [allocate(99_999)], today).completed).toBe(false);
    expect(goalProgress(g, [allocate(100_000)], today).completed).toBe(true);
    expect(goalProgress(g, [allocate(150_000)], today).progressBp).toBe(10_000);
  });

  it("lists moves newest first, without deleted ones or other goals", () => {
    const newest = allocate(1, LAPTOP_GOAL, { occurredAt: ist("2026-11-09") });
    const oldest = release(1, LAPTOP_GOAL, { occurredAt: ist("2026-11-01") });
    const gone = allocate(1, LAPTOP_GOAL, { deletedAt: ist("2026-11-09") });
    const other = allocate(1, id(301));
    expect(goalMoves(LAPTOP_GOAL, [oldest, gone, other, newest]).map((m) => m.id)).toEqual([
      newest.id,
      oldest.id,
    ]);
  });

  it("forecasts from the pace so far, and only with a pace to go on", () => {
    const g = goal(LAPTOP_GOAL, 100_000);
    const one = [allocate(10_000, LAPTOP_GOAL, { occurredAt: ist("2026-11-01") })];
    expect(goalForecast(g, one, NOW, TZ)).toBeNull();
    const two = [...one, allocate(8_000, LAPTOP_GOAL, { occurredAt: ist("2026-11-05") })];
    expect(goalForecast(g, two, NOW, TZ)).toEqual({
      dailyPacePaise: 2_000,
      reachedOn: "2026-12-21",
    });
    const reached = [...two, allocate(82_000, LAPTOP_GOAL, { occurredAt: ist("2026-11-06") })];
    expect(goalForecast(g, reached, NOW, TZ)).toBeNull();
  });

  it("a purchase releases the price or all that's saved, whichever is less", () => {
    expect(releaseFromSaved(30_000, 40_000)).toBe(30_000);
    expect(releaseFromSaved(55_000, 40_000)).toBe(40_000);
    expect(releaseFromSaved(55_000, 0)).toBe(0);
    expect(releaseFromSaved(55_000, -1)).toBe(0);
  });
});

describe("Phase 7 leftovers", () => {
  const period = resolvePeriod({ kind: "all_time" }, 0, settings);
  const words = {
    period: "this month",
    previous: null,
    unit: "month",
    money,
    labelOf: (key: string) => key,
  };
  const groupOf = (description: string, count: number, amount: number) =>
    purchaseGroups(
      Array.from({ length: count }, () => expense(amount, { description })),
      period,
      { by: "description" },
    )[0]!;

  it.each([
    ["Bus", 4, 2_000, "You logged Bus 4 times for ₹20 each: ₹80 this month."],
    ["Recharge", 3, 19_900, "You logged Recharge 3 times for ₹199 each: ₹597 this month."],
    ["coffee", 16, 2_500, "You logged coffee 16 times for ₹25 each: ₹400 this month."],
    [
      "Auto to college",
      2,
      6_000,
      "You logged Auto to college twice for ₹60 each: ₹120 this month.",
    ],
  ])("names %s as the user wrote it", (label, count, amount, sentence) => {
    expect(repeatInsightText(groupOf(label, count, amount), words)).toBe(sentence);
  });

  it("what-ifs read naturally for anything, and keep the label's spelling", () => {
    const group = groupOf("Bus", 4, 2_000);
    expect(whatIfText("Bus", whatIf(group, 1), money, "a period like this one")).toBe(
      "If you logged one fewer Bus entry at ₹20 in a period like this one, you’d spend ₹20 less.",
    );
    expect(whatIfText("Bus", whatIf(group, 2), money, "a period like this one")).toBe(
      "If you logged 2 fewer Bus entries at ₹20 in a period like this one, you’d spend ₹40 less.",
    );
  });

  const TILE = id(600);
  const tile = (description: string, presetId: string | null, source = "quick_add") =>
    ({
      ...expense(2_000, { description, source: source as "quick_add" }),
      presetId,
    }) as ExpenseTransaction;

  it("groups by the tile, so a rename doesn't split it, and shows its current name", () => {
    const rows = [tile("Chai", TILE), tile("Masala chai", TILE), tile("Tea at canteen", TILE)];
    const groups = purchaseGroups(rows, period, {
      by: "tile",
      tileLabels: new Map([[TILE, "Masala chai"]]),
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: "Masala chai", count: 3, netPaise: 6_000 });
  });

  it("older quick-add entries with no tile id fall back to their description", () => {
    const byId = indexById([]);
    expect(purchaseGroupKey(tile("Tea", null), "tile", byId)).toBe("tea");
    expect(purchaseGroupKey(tile("Tea", TILE), "tile", byId)).toBe(TILE);
    expect(purchaseGroupKey(tile("Tea", null, "manual"), "tile", byId)).toBeNull();
  });

  it("a refund joins the tile group of the purchase it refunds", () => {
    const purchase = tile("Chai", TILE);
    const back = refund(500, purchase.id) as RefundTransaction;
    expect(purchaseGroupKey(back, "tile", indexById([purchase]))).toBe(TILE);
  });

  it("the description grouping isn't affected by tiles", () => {
    const rows = [tile("Chai", TILE), tile("Chai", null)];
    expect(purchaseGroups(rows, period, { by: "description" })).toHaveLength(1);
  });

  it("income still never counts as a purchase", () => {
    expect(purchaseGroups([income(100_000)], period, { by: "tile" })).toEqual([]);
  });
});
