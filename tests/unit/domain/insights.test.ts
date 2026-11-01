import { describe, expect, it } from "vitest";

import {
  type InsightWords,
  type PurchaseGrouping,
  type Transaction,
  UNCATEGORIZED,
  buildInsights,
  categoryBreakdown,
  chartShares,
  comparePeriods,
  comparisonWindows,
  formatINR,
  isSmallPurchase,
  indexById,
  leakReport,
  netSpending,
  purchaseGroups,
  purchaseTextKey,
  recurringSignals,
  resolvePeriod,
  smallPurchaseTotal,
  spendingDisplay,
  spendingTrend,
  sumPaise,
  trendView,
  whatIf,
  whatIfText,
  formatMoney,
} from "@/domain";

import {
  BUS,
  FOOD,
  SNACKS,
  TEA,
  TRANSPORT,
  allocate,
  expense,
  income,
  ist,
  istMs,
  refund,
  release,
  transfer,
  BANK,
  CASH,
} from "./fixtures";

const NOW = istMs("2026-10-21", "18:00"); // a Wednesday
const TODAY = "2026-10-21";
const IST = { timeZone: "Asia/Kolkata", weekStartsOn: 1 } as const;
const month = resolvePeriod({ kind: "this_month" }, NOW, IST);
const lastMonth = resolvePeriod({ kind: "previous_month" }, NOW, IST);
const allTime = resolvePeriod({ kind: "all_time" }, NOW, IST);
const custom = (from: string, to: string) => resolvePeriod({ kind: "custom", from, to }, NOW, IST);

const NAMES: Record<string, string> = {
  [FOOD]: "Food & Drinks",
  [TEA]: "Food & Drinks › Tea",
  [SNACKS]: "Food & Drinks › Snacks",
  [TRANSPORT]: "Transport",
  [BUS]: "Transport › Bus",
  [UNCATEGORIZED]: "Unassigned",
};
const words: InsightWords = {
  period: "this month",
  previous: "the same days last month",
  unit: "month",
  money: (paise) => formatINR(paise),
  labelOf: (key) => NAMES[key] ?? key,
};
const THRESHOLD = 5_000;
const model = (ledger: Transaction[], period = month, w = words, today = TODAY) =>
  buildInsights({ ledger, period, today, settings: IST, thresholdPaise: THRESHOLD, words: w });

/** Every number in a model, however deep, must be a real number. */
function assertFinite(value: unknown, path = "model"): void {
  if (typeof value === "number") {
    expect(Number.isFinite(value), path).toBe(true);
  } else if (typeof value === "string") {
    expect(value, path).not.toMatch(/NaN|undefined|Infinity/);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => assertFinite(v, `${path}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) assertFinite(v, `${path}.${k}`);
  }
}

describe("aggregation reconciles with raw transactions", () => {
  const ledger = [
    expense(10_000, { occurredAt: ist("2026-10-05"), subcategoryId: TEA }),
    expense(20_000, { occurredAt: ist("2026-10-06"), subcategoryId: SNACKS }),
    expense(5_000, { occurredAt: ist("2026-10-07"), categoryId: TRANSPORT, subcategoryId: BUS }),
    expense(3_000, { occurredAt: ist("2026-10-08"), categoryId: null }),
    income(100_000, { occurredAt: ist("2026-10-01") }),
    transfer(50_000, CASH, BANK, { occurredAt: ist("2026-10-02") }),
    allocate(25_000, undefined, { occurredAt: ist("2026-10-03") }),
    release(5_000, undefined, { occurredAt: ist("2026-10-04") }),
    expense(99_900, { occurredAt: ist("2026-10-09"), deletedAt: ist("2026-10-10") }),
    expense(77_700, { occurredAt: ist("2026-10-09"), voidedAt: ist("2026-10-10") }),
  ];

  it("counts only expenses, never income, transfers, allocations, deleted or voided rows", () => {
    const m = model(ledger);
    expect(m.breakdown.netPaise).toBe(38_000);
    expect(sumPaise(m.breakdown.categories.map((c) => c.netPaise))).toBe(38_000);
    expect(m.breakdown.expenseCount).toBe(4);
    expect(m.income).toEqual({ paise: 100_000, count: 1 });
    for (const c of m.breakdown.categories) {
      expect(sumPaise(c.subcategories.map((s) => s.netPaise))).toBe(c.netPaise);
    }
  });

  it("keeps Unassigned as its own visible group", () => {
    const m = model(ledger);
    const group = m.breakdown.categories.find((c) => c.key === UNCATEGORIZED);
    expect(group?.netPaise).toBe(3_000);
    expect(m.cards.find((c) => c.kind === "unassigned")?.text).toBe(
      "1 entry worth ₹30 has no category yet.",
    );
  });

  it("a trend adds up to the period's net total, in every granularity", () => {
    for (const g of ["day", "week", "month"] as const) {
      const buckets = spendingTrend(ledger, month, g, IST);
      expect(sumPaise(buckets.map((b) => b.netPaise))).toBe(netSpending(ledger, month));
    }
  });

  it("chart shares add up to about 100 % when a refund-heavy group is drawn at zero", () => {
    const original = expense(50_000, { occurredAt: ist("2026-09-20"), categoryId: TRANSPORT });
    const rows = [
      original,
      expense(10_000, { occurredAt: ist("2026-10-05") }),
      refund(50_000, original.id, { occurredAt: ist("2026-10-06") }),
    ];
    const b = categoryBreakdown(rows, month);
    const shares = chartShares(b.categories);
    expect(shares.get(FOOD)).toBe(10_000);
    expect(shares.get(TRANSPORT)).toBe(0);
  });

  it("uses the profile currency in the refund note", () => {
    const original = expense(50_000, { occurredAt: ist("2026-09-20") });
    const rows = [original, refund(50_000, original.id, { occurredAt: ist("2026-10-06") })];
    const [group] = categoryBreakdown(rows, month).categories;
    const note = spendingDisplay(group!, (p) => formatMoney(p, { currency: "USD" })).note;
    expect(note).toContain("$500");
    expect(note).not.toContain("₹");
  });
});

describe("period comparison", () => {
  it("compares a running month with the same days of the last one, not all of it", () => {
    const windows = comparisonWindows(month, TODAY, 2)!;
    expect(windows.inProgress).toBe(true);
    expect(windows.current.endDate).toBe("2026-10-21");
    expect(windows.previous[0]).toMatchObject({
      startDate: "2026-09-01",
      endDate: "2026-09-21",
    });
    expect(windows.previous[1]).toMatchObject({
      startDate: "2026-08-01",
      endDate: "2026-08-21",
    });
  });

  it("purchases later in the earlier month don't count against a running month", () => {
    const rows = [
      ...[1, 2, 3].map((d) => expense(10_000, { occurredAt: ist(`2026-10-0${d}`) })),
      ...[1, 2, 3].map((d) => expense(10_000, { occurredAt: ist(`2026-09-0${d}`) })),
      expense(900_000, { occurredAt: ist("2026-09-28") }),
    ];
    const m = model(rows);
    expect(m.comparison?.comparable).toBe(true);
    expect(m.comparison?.total.previousPaise).toBe(30_000);
    expect(m.comparison?.total.deltaPaise).toBe(0);
  });

  it("a finished month compares with the whole month before, even if that one is longer", () => {
    const windows = comparisonWindows(lastMonth, TODAY, 1)!; // September vs all 31 days of August
    expect(windows.inProgress).toBe(false);
    expect(windows.previous[0]).toMatchObject({ startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  it("has no comparison for all time or for a period that hasn't started", () => {
    expect(comparisonWindows(allTime, TODAY, 1)).toBeNull();
    expect(comparisonWindows(custom("2026-12-01", "2026-12-07"), TODAY, 1)).toBeNull();
    expect(model([expense(100)], allTime).comparisonNote).toMatch(/All time/);
  });

  it("the main driver moves the same way as the category", () => {
    const before = [
      expense(50_000, { occurredAt: ist("2026-09-05"), subcategoryId: SNACKS }),
      expense(1_000, { occurredAt: ist("2026-09-05"), subcategoryId: TEA }),
    ];
    const now = [
      expense(10_000, { occurredAt: ist("2026-10-05"), subcategoryId: SNACKS }),
      expense(45_000, { occurredAt: ist("2026-10-05"), subcategoryId: TEA }),
    ];
    const food = comparePeriods(categoryBreakdown(now, month), categoryBreakdown(before, lastMonth))
      .categories[0]!;
    expect(food.deltaPaise).toBe(4_000);
    // Snacks fell by more than tea rose, but a fall can't explain an increase.
    expect(food.mainDriver?.key).toBe(TEA);
  });

  it("writes the spec's change sentence, and says 'mainly' only when it's true", () => {
    const week = {
      ...words,
      previous: "the previous week",
      period: "this week",
    };
    const rows = [
      ...[12, 13, 13].map((d) =>
        expense(10_000, { occurredAt: ist(`2026-10-${d}`), subcategoryId: SNACKS }),
      ),
      ...[19, 20].map((d) =>
        expense(10_000, { occurredAt: ist(`2026-10-${d}`), subcategoryId: SNACKS }),
      ),
      expense(10_000, { occurredAt: ist("2026-10-20"), subcategoryId: SNACKS }),
      expense(45_000, { occurredAt: ist("2026-10-20"), subcategoryId: SNACKS }),
    ];
    const period = resolvePeriod({ kind: "this_week" }, NOW, IST);
    const text = model(rows, period, week).cards.find((c) => c.kind === "change")?.text;
    expect(text).toBe(
      "Food & Drinks increased by ₹450 compared with the previous week, mainly due to snacks.",
    );

    const spread = [
      ...[12, 13, 13].map((d) => expense(10_000, { occurredAt: ist(`2026-10-${d}`) })),
      ...[19, 20, 20].map((d) => expense(10_000, { occurredAt: ist(`2026-10-${d}`) })),
      expense(45_000, { occurredAt: ist("2026-10-20") }),
    ];
    const plain = model(spread, period, week).cards.find((c) => c.kind === "change")?.text;
    expect(plain).toBe("Food & Drinks increased by ₹450 compared with the previous week.");
  });
});

describe("leak grouping", () => {
  const coffee = (paise: number, day: string, o = {}) =>
    expense(paise, { description: "Coffee", occurredAt: ist(`2026-10-${day}`), ...o });

  it("treats case, plurals, word order, digits and filler as the same description", () => {
    expect(purchaseTextKey("Coffee")).toBe("coffee");
    expect(purchaseTextKey("coffees!!")).toBe("coffee");
    expect(purchaseTextKey("Masala chai ₹15")).toBe(purchaseTextKey("chai masala"));
    expect(purchaseTextKey("tea at the canteen")).toBe(purchaseTextKey("Canteen tea"));
  });

  it("never merges different words that are one letter apart", () => {
    expect(purchaseTextKey("coffee")).not.toBe(purchaseTextKey("toffee"));
    expect(purchaseTextKey(null)).toBeNull();
    expect(purchaseTextKey("  ")).toBeNull();
  });

  it("groups repeated small purchases and reports frequency, total, average and share", () => {
    const rows = [
      coffee(2_500, "05"),
      coffee(2_500, "06", { description: "coffees" }),
      coffee(2_500, "07"),
      coffee(2_500, "08"),
      expense(90_000, { description: "Books", occurredAt: ist("2026-10-08") }),
    ];
    const [group, ...rest] = leakReport({
      ledger: rows,
      period: month,
      previous: lastMonth,
      by: "description",
      thresholdPaise: THRESHOLD,
    }).groups;
    expect(rest).toEqual([]);
    expect(group).toMatchObject({
      label: "Coffee",
      count: 4,
      netPaise: 10_000,
      averagePaise: 2_500,
      shareBp: 1_000,
    });
  });

  it("needs repeats, and the threshold is strict", () => {
    const rows = [coffee(5_000, "05"), coffee(5_000, "06"), coffee(4_999, "07")];
    const byId = indexById(rows);
    expect(isSmallPurchase(rows[0] as never, 5_000, byId)).toBe(false);
    expect(isSmallPurchase(rows[2] as never, 5_000, byId)).toBe(true);
    const report = (thresholdPaise: number) =>
      leakReport({
        ledger: rows,
        period: month,
        previous: null,
        by: "description",
        thresholdPaise,
      }).groups;
    expect(report(5_000)).toEqual([]);
    expect(report(5_001)).toHaveLength(1);
  });

  it("nets a refund into the purchase's group, in the refund's period", () => {
    const old = coffee(2_500, "05", { occurredAt: ist("2026-09-20") });
    const rows = [
      old,
      coffee(2_500, "05"),
      coffee(2_500, "06"),
      coffee(2_500, "07"),
      refund(2_500, old.id, { description: "Returned", occurredAt: ist("2026-10-08") }),
    ];
    const [group] = purchaseGroups(rows, month, { by: "description", underPaise: THRESHOLD });
    expect(group).toMatchObject({
      count: 3,
      refundCount: 1,
      grossPaise: 7_500,
      refundsPaise: 2_500,
      netPaise: 5_000,
    });
  });

  it("a refund of a big purchase isn't a small purchase, whatever its own amount", () => {
    const big = expense(90_000, { description: "Shoes", occurredAt: ist("2026-10-05") });
    const rows = [big, refund(2_000, big.id, { occurredAt: ist("2026-10-06") })];
    expect(smallPurchaseTotal(rows, month, THRESHOLD)).toMatchObject({ count: 0, netPaise: 0 });
  });

  it("groups don't overlap within a grouping, in any grouping", () => {
    const rows = [
      coffee(2_500, "05", { merchant: "CCD", source: "quick_add" }),
      coffee(2_500, "06", { merchant: "CCD", source: "quick_add" }),
      coffee(2_500, "07", { merchant: "Starbucks" }),
      expense(1_500, { description: "Tea", occurredAt: ist("2026-10-07"), merchant: "CCD" }),
    ];
    for (const by of ["description", "merchant", "tile", "category"] as PurchaseGrouping[]) {
      const ids = purchaseGroups(rows, month, { by }).flatMap((g) => g.transactionIds);
      expect(new Set(ids).size, by).toBe(ids.length);
    }
    const tiles = purchaseGroups(rows, month, { by: "tile" });
    expect(tiles).toHaveLength(1);
    expect(tiles[0]?.count).toBe(2);
  });

  it("counts what a grouping can't place, instead of hiding it", () => {
    const rows = [coffee(2_500, "05"), coffee(2_500, "06"), coffee(2_500, "07")];
    const report = leakReport({
      ledger: rows,
      period: month,
      previous: null,
      by: "merchant",
      thresholdPaise: THRESHOLD,
    });
    expect(report.groups).toEqual([]);
    expect(report.ungroupedCount).toBe(3);
  });

  it("compares with the previous window only when there was anything in it", () => {
    const rows = [coffee(2_500, "05"), coffee(2_500, "06"), coffee(2_500, "07")];
    const options = {
      period: month,
      previous: lastMonth,
      by: "description" as const,
      thresholdPaise: THRESHOLD,
    };
    const empty = leakReport({ ...options, ledger: rows }).groups[0]!;
    expect(empty.comparison).toBeNull();
    expect(empty.comparisonNote).toMatch(/nothing to compare/);

    const withData = [...rows, expense(9_000, { occurredAt: ist("2026-09-05") })];
    const compared = leakReport({ ...options, ledger: withData }).groups[0]!;
    expect(compared.comparison).toMatchObject({ previousPaise: 0, previousCount: 0 });
  });

  it("what-if uses exact integers and is capped at what happened", () => {
    const [group] = purchaseGroups(
      [1, 2, 3, 4, 5, 6].map((d) => coffee(2_500, `0${d}`)),
      month,
      { by: "description" },
    );
    expect(whatIf(group!, 4)).toEqual({
      fewer: 4,
      typicalPaise: 2_500,
      savedPaise: 10_000,
      sameAmount: true,
    });
    expect(whatIf(group!, 99).fewer).toBe(6);
    expect(whatIf(group!, -2).savedPaise).toBe(0);
    expect(whatIfText("coffee", whatIf(group!, 4), formatINR, "a period like this one")).toBe(
      "If you made 4 fewer ₹25 coffee purchases in a period like this one, you’d spend ₹100 less.",
    );
  });

  it("the what-if wording stays neutral", () => {
    const [group] = purchaseGroups([coffee(2_000, "05"), coffee(3_000, "06")], month, {
      by: "description",
    });
    const text = whatIfText("coffee", whatIf(group!, 2), formatINR, "a period like this one");
    expect(text).toBe(
      "If you made 2 fewer coffee purchases at about ₹25 in a period like this one, you’d spend about ₹50 less.",
    );
    expect(text).not.toMatch(/waste|unnecessary|should|stop|bad/i);
  });
});

describe("insight text", () => {
  const coffees = Array.from({ length: 16 }, (_, i) =>
    expense(2_500, {
      description: "Coffee",
      occurredAt: ist(`2026-10-${String((i % 20) + 1).padStart(2, "0")}`),
    }),
  );

  it("writes the spec's example from real entries", () => {
    expect(model(coffees).cards[0]?.text).toBe(
      "You bought coffee 16 times for ₹25 each: ₹400 this month.",
    );
  });

  it("says 'about' when prices differ, and includes refunds", () => {
    const rows = [
      expense(2_000, { description: "Coffee", occurredAt: ist("2026-10-05") }),
      expense(3_000, { description: "Coffee", occurredAt: ist("2026-10-06") }),
      expense(4_000, { description: "Coffee", occurredAt: ist("2026-10-07") }),
    ];
    expect(model(rows).cards[0]?.text).toBe(
      "You bought coffee 3 times for about ₹30 each: ₹90 this month.",
    );
    const withRefund = [...rows, refund(2_000, rows[0]!.id, { occurredAt: ist("2026-10-08") })];
    expect(model(withRefund).cards[0]?.text).toBe(
      "You bought coffee 3 times for about ₹30 each: ₹90 this month, or ₹70 after ₹20 in refunds.",
    );
  });

  it("uses the threshold it is given", () => {
    const rows = [1, 2, 3].map((d) =>
      expense(6_000, { description: `Item ${"abc"[d - 1]}${d}`, occurredAt: ist(`2026-10-0${d}`) }),
    );
    const at = (thresholdPaise: number) =>
      buildInsights({
        ledger: rows,
        period: month,
        today: TODAY,
        settings: IST,
        thresholdPaise,
        words,
      }).small;
    expect(at(5_000).count).toBe(0);
    expect(at(10_000)).toMatchObject({ count: 3, netPaise: 18_000 });
  });

  it("names unusual changes and explains how they were found", () => {
    const rows = [
      ...["2026-09-07", "2026-08-07", "2026-07-07", "2026-06-07"].map((d) =>
        expense(30_000, { occurredAt: ist(d) }),
      ),
      expense(90_000, { occurredAt: ist("2026-10-07") }),
      // Tracking began before June, so June is a whole, fair window.
      expense(100, { occurredAt: ist("2026-05-20") }),
    ];
    const [found] = model(rows).unusual;
    expect(found).toMatchObject({ direction: "higher", key: FOOD, typicalPaise: 30_000 });
    expect(found?.text).toBe(
      "Food & Drinks is higher than usual this month: ₹900, against a typical ₹300.",
    );
    expect(found?.how).toContain("previous 4 months (₹300, ₹300, ₹300, ₹300)");
    expect(found?.how).toContain("₹50");
  });

  it("doesn't flag a change smaller than the user's small-purchase amount", () => {
    const rows = [
      ...["2026-09-07", "2026-08-07", "2026-07-07", "2026-06-07"].map((d) =>
        expense(1_000, { occurredAt: ist(d) }),
      ),
      expense(3_000, { occurredAt: ist("2026-10-07") }),
    ];
    expect(model(rows).unusual).toEqual([]);
  });

  it("doesn't treat months before tracking began as a ₹0 baseline", () => {
    const m = model([
      expense(30_000, { occurredAt: ist("2026-09-07") }),
      expense(90_000, { occurredAt: ist("2026-10-07") }),
    ]);
    expect(m.unusual).toEqual([]);
    expect(m.unusualNote).toMatch(/Not enough history/);
  });

  it("finds steady rhythms, and ignores habits, one-offs and things that stopped", () => {
    const rent = ["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"].map((d) =>
      expense(200_000, { description: "Mess fee", occurredAt: ist(d) }),
    );
    const habit = [17, 18, 19, 20].map((d) =>
      expense(1_500, { description: "Tea", occurredAt: ist(`2026-10-${d}`) }),
    );
    const stopped = ["2026-02-03", "2026-03-03", "2026-04-03"].map((d) =>
      expense(9_900, { description: "Old plan", occurredAt: ist(d) }),
    );
    const uneven = ["2026-08-01", "2026-08-03", "2026-10-15"].map((d) =>
      expense(5_000, { description: "Auto", occurredAt: ist(d) }),
    );
    const signals = recurringSignals([...rent, ...habit, ...stopped, ...uneven], TODAY, IST);
    expect(signals.map((s) => s.label)).toEqual(["Mess fee"]);
    expect(signals[0]).toMatchObject({
      cadence: "monthly",
      count: 4,
      typicalPaise: 200_000,
      lastDate: "2026-10-03",
    });
  });

  it("doesn't call wildly different prices recurring", () => {
    const rows = ["2026-08-03", "2026-09-03", "2026-10-03"].map((d, i) =>
      expense([10_000, 50_000, 90_000][i]!, { description: "Shopping", occurredAt: ist(d) }),
    );
    expect(recurringSignals(rows, TODAY, IST)).toEqual([]);
  });
});

describe("sparse data", () => {
  it("a brand-new account: an honest empty state and no invented figures", () => {
    const m = model([]);
    expect(m.status).toBe("no_spending");
    expect(m.cards).toEqual([]);
    expect(m.averagePaise).toBeNull();
    expect(m.medianPaise).toBeNull();
    expect(m.comparison?.comparable).toBe(false);
    assertFinite(m);
  });

  it("one entry: totals, but no average, median, comparison, trend or insight", () => {
    const m = model([expense(4_000, { description: "Tea", occurredAt: ist("2026-10-20") })]);
    expect(m.status).toBe("ready");
    expect(m.breakdown.netPaise).toBe(4_000);
    expect(m.averagePaise).toBeNull();
    expect(m.medianPaise).toBeNull();
    expect(m.comparison?.comparable).toBe(false);
    expect(m.comparisonNote).toMatch(/at least 3/);
    expect(m.changes).toEqual([]);
    expect(m.cards).toEqual([]);
    expect(m.frequent).toEqual([]);
    expect(m.unusual).toEqual([]);
    expect(m.recurring).toEqual([]);
    assertFinite(m);

    const trend = trendView(
      [expense(4_000, { occurredAt: ist("2026-10-20") })],
      month,
      TODAY,
      IST,
      null,
    );
    expect(trend.sparseReason).toMatch(/Not enough data for a trend/);
    assertFinite(trend);
  });

  it("shows the average from 2 purchases and the median from 3", () => {
    const two = [15, 16].map((d) => expense(1_000, { occurredAt: ist(`2026-10-${d}`) }));
    expect(model(two)).toMatchObject({ averagePaise: 1_000, medianPaise: null });
    const three = [...two, expense(4_000, { occurredAt: ist("2026-10-17") })];
    expect(model(three)).toMatchObject({ averagePaise: 2_000, medianPaise: 1_000 });
  });

  it("income alone isn't spending", () => {
    const m = model([income(100_000, { occurredAt: ist("2026-10-05") })]);
    expect(m.status).toBe("no_spending");
    expect(m.income.paise).toBe(100_000);
    assertFinite(m);
  });

  it("an empty period is told apart from an empty account", () => {
    expect(model([expense(4_000, { occurredAt: ist("2026-08-01") })]).status).toBe("empty_period");
  });

  it("a period holding only a refund stays finite and honest", () => {
    const original = expense(50_000, { occurredAt: ist("2026-09-20") });
    const m = model([original, refund(50_000, original.id, { occurredAt: ist("2026-10-05") })]);
    expect(m.status).toBe("ready");
    expect(m.breakdown).toMatchObject({ netPaise: -50_000, expenseCount: 0 });
    expect(m.averagePaise).toBeNull();
    expect(m.small.shareBp).toBeNull();
    assertFinite(m);
    const trend = trendView(
      [original, refund(50_000, original.id, { occurredAt: ist("2026-10-05") })],
      month,
      TODAY,
      IST,
      null,
    );
    expect(trend.points.every((p) => p.chartPaise >= 0)).toBe(true);
  });
});

describe("trend view", () => {
  const rows = [
    expense(1_000, { occurredAt: ist("2026-10-01") }),
    expense(2_000, { occurredAt: ist("2026-10-20") }),
  ];

  it("doesn't draw days that haven't happened as ₹0 days", () => {
    const view = trendView(rows, month, TODAY, IST, "day");
    expect(view.points.at(-1)?.startDate).toBe(TODAY);
    expect(sumPaise(view.points.map((p) => p.netPaise))).toBe(3_000);
  });

  it("clips a week bucket to the period, so its link can't pull in September", () => {
    // 1 Oct 2026 is a Thursday, so the first week bucket starts on 28 Sep.
    const view = trendView(rows, month, TODAY, IST, "week");
    expect(view.points[0]).toMatchObject({
      startDate: "2026-09-28",
      from: "2026-10-01",
      to: "2026-10-04",
    });
  });

  it("offers only granularities that make sense, and bounds all time", () => {
    expect(trendView(rows, month, TODAY, IST, null).options).toEqual(["day", "week"]);
    expect(trendView(rows, month, TODAY, IST, "month").granularity).toBe("day");
    const today = resolvePeriod({ kind: "today" }, NOW, IST);
    expect(
      trendView([expense(1_000, { occurredAt: ist(TODAY) })], today, TODAY, IST, null).sparseReason,
    ).toMatch(/longer period/);
    const span = [expense(1_000, { occurredAt: ist("2025-01-15") }), ...rows];
    const view = trendView(span, allTime, TODAY, IST, null);
    expect(view.granularity).toBe("month");
    expect(view.points[0]?.startDate).toBe("2025-01-01");
    expect(view.points.length).toBe(22);
  });

  it("buckets by the profile timezone", () => {
    // 21:00 on 19 Oct in New York is already 20 Oct in India.
    const late = [expense(1_000, { occurredAt: "2026-10-19T21:00:00-04:00" })];
    const newYork = { timeZone: "America/New_York", weekStartsOn: 1 } as const;
    const period = resolvePeriod(
      { kind: "custom", from: "2026-10-19", to: "2026-10-20" },
      NOW,
      newYork,
    );
    const dayOf = (settings: typeof IST | typeof newYork) =>
      spendingTrend(
        late,
        resolvePeriod({ kind: "custom", from: "2026-10-19", to: "2026-10-20" }, NOW, settings),
        "day",
        settings,
      ).find((b) => b.netPaise > 0)?.startDate;
    expect(period.timeZone).toBe("America/New_York");
    expect(dayOf(newYork)).toBe("2026-10-19");
    expect(dayOf(IST)).toBe("2026-10-20");
  });
});
