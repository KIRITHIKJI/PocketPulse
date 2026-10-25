import {
  UNCATEGORIZED,
  amountStats,
  categoryBreakdown,
  comparePeriods,
  previousPeriod,
  resolvePeriod,
  spendingDisplay,
  spendingTrend,
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
  transfer,
  BANK,
  CASH,
} from "./fixtures";

const NOW = istMs("2026-10-14", "20:00"); // Wednesday
const week = resolvePeriod({ kind: "this_week" }, NOW); // 12–18 Oct
const lastWeek = previousPeriod(week)!; // 5–11 Oct

const teaAt = (paise: number, date: string) =>
  expense(paise, { categoryId: FOOD, subcategoryId: TEA, occurredAt: ist(date) });

describe("amountStats", () => {
  it("computes count, total, average and median with integer rounding", () => {
    expect(amountStats([])).toEqual({
      count: 0,
      totalPaise: 0,
      averagePaise: null,
      medianPaise: null,
      minPaise: null,
      maxPaise: null,
    });
    expect(amountStats([1500, 2000, 2500])).toMatchObject({
      totalPaise: 6000,
      averagePaise: 2000,
      medianPaise: 2000,
    });
    expect(amountStats([1000, 1001])).toMatchObject({ averagePaise: 1001, medianPaise: 1001 }); // 1000.5 half-up
    expect(amountStats([100, 100, 101])).toMatchObject({ averagePaise: 100, medianPaise: 100 });
    expect(amountStats([5000, 100, 300, 200])).toMatchObject({
      medianPaise: 250,
      minPaise: 100,
      maxPaise: 5000,
    });
  });
});

describe("categoryBreakdown", () => {
  const snack = expense(3500, {
    categoryId: FOOD,
    subcategoryId: SNACKS,
    occurredAt: ist("2026-10-13"),
  });
  const ledger = [
    teaAt(1500, "2026-10-12"),
    teaAt(1500, "2026-10-13"),
    teaAt(2000, "2026-10-14"),
    snack,
    refund(1500, snack.id, { occurredAt: ist("2026-10-14") }), // inherits Food › Snacks
    expense(2000, { categoryId: TRANSPORT, subcategoryId: BUS, occurredAt: ist("2026-10-12") }),
    expense(1000, { categoryId: null, occurredAt: ist("2026-10-13") }),
    // never spending:
    income(500_000, { occurredAt: ist("2026-10-12") }),
    transfer(10_000, BANK, CASH, { occurredAt: ist("2026-10-12") }),
    allocate(20_000, undefined, { occurredAt: ist("2026-10-12") }),
    // outside the week:
    teaAt(9_900, "2026-10-11"),
    // deleted:
    { ...teaAt(7_700, "2026-10-13"), deletedAt: ist("2026-10-13") },
  ];
  const b = categoryBreakdown(ledger, week);

  it("totals only expenses and refunds in the period", () => {
    expect(b.grossPaise).toBe(1500 + 1500 + 2000 + 3500 + 2000 + 1000);
    expect(b.refundsPaise).toBe(1500);
    expect(b.netPaise).toBe(10_000);
    expect(b.expenseCount).toBe(6);
  });

  it("groups by category and subcategory with counts, average, median and share", () => {
    const food = b.categories.find((c) => c.key === FOOD)!;
    expect(food).toMatchObject({
      grossPaise: 8500,
      refundsPaise: 1500,
      netPaise: 7000,
      count: 4,
      refundCount: 1,
    });
    expect(food.averagePaise).toBe(2125);
    expect(food.medianPaise).toBe(1750);
    expect(food.shareBp).toBe(7000);
    expect(food.transactionIds).toHaveLength(5);

    const tea = food.subcategories.find((s) => s.key === TEA)!;
    expect(tea).toMatchObject({
      netPaise: 5000,
      count: 3,
      averagePaise: 1667,
      medianPaise: 1500,
      shareBp: 7143,
    });
    const snacks = food.subcategories.find((s) => s.key === SNACKS)!;
    expect(snacks).toMatchObject({ grossPaise: 3500, refundsPaise: 1500, netPaise: 2000 });

    expect(b.categories.map((c) => c.key)).toEqual([FOOD, TRANSPORT, UNCATEGORIZED]);
    expect(b.categories.find((c) => c.key === UNCATEGORIZED)!.shareBp).toBe(1000);
  });

  it("category and subcategory totals reconcile with the period total", () => {
    expect(b.categories.reduce((s, c) => s + c.netPaise, 0)).toBe(b.netPaise);
    for (const c of b.categories) {
      expect(c.subcategories.reduce((s, sub) => s + sub.netPaise, 0)).toBe(c.netPaise);
    }
  });

  it("returns null shares when there's no positive spending", () => {
    const e = expense(1000, { occurredAt: ist("2026-10-05") });
    const onlyRefund = categoryBreakdown(
      [e, refund(1000, e.id, { occurredAt: ist("2026-10-13") })],
      week,
    );
    expect(onlyRefund.netPaise).toBe(-1000);
    expect(onlyRefund.categories[0]!.shareBp).toBeNull();
  });
});

describe("refund in a later period than its purchase", () => {
  // Shoes bought last week (₹800), ₹500 refunded this week; this week also ₹150 of snacks.
  const shoes = expense(80_000, {
    categoryId: FOOD,
    subcategoryId: SNACKS,
    occurredAt: ist("2026-10-07"),
  });
  const ledger = [
    shoes,
    refund(50_000, shoes.id, { occurredAt: ist("2026-10-13") }),
    expense(15_000, { categoryId: FOOD, subcategoryId: SNACKS, occurredAt: ist("2026-10-14") }),
    expense(20_000, { categoryId: TRANSPORT, subcategoryId: BUS, occurredAt: ist("2026-10-14") }),
  ];

  it("counts the refund in its own period, where the category's net can go below zero", () => {
    const thisWeek = categoryBreakdown(ledger, week);
    const food = thisWeek.categories.find((c) => c.key === FOOD)!;
    expect(food).toMatchObject({
      grossPaise: 15_000,
      refundsPaise: 50_000,
      netPaise: -35_000,
      earlierPurchaseRefundsPaise: 50_000,
      count: 1,
      refundCount: 1,
      shareBp: null, // no negative shares
    });
    // Period totals stay exact: 150 + 200 − 500 = −150.
    expect(thisWeek.netPaise).toBe(-15_000);
    expect(thisWeek.categories.find((c) => c.key === TRANSPORT)!.shareBp).toBeNull();
    // The earlier week keeps the full purchase; nothing is rewritten retroactively.
    const earlier = categoryBreakdown(ledger, lastWeek);
    expect(earlier.categories.find((c) => c.key === FOOD)!.netPaise).toBe(80_000);
    // Across both weeks the refund simply offsets the purchase.
    const both = categoryBreakdown(
      ledger,
      resolvePeriod({ kind: "custom", from: "2026-10-05", to: "2026-10-18" }, NOW),
    );
    expect(both.categories.find((c) => c.key === FOOD)).toMatchObject({
      netPaise: 45_000,
      earlierPurchaseRefundsPaise: 0,
    });
  });

  it("charts draw a zero bar with an explanation instead of a negative bar", () => {
    const food = categoryBreakdown(ledger, week).categories.find((c) => c.key === FOOD)!;
    expect(spendingDisplay(food)).toEqual({
      chartPaise: 0,
      netRefundPaise: 35_000,
      note: "Refunds exceeded purchases here by ₹350 (₹500 of it refunds purchases from an earlier period).",
    });
    const transport = categoryBreakdown(ledger, week).categories.find((c) => c.key === TRANSPORT)!;
    expect(spendingDisplay(transport)).toEqual({
      chartPaise: 20_000,
      netRefundPaise: 0,
      note: null,
    });
  });

  it("trend buckets and budgets agree with the breakdown", () => {
    const days = spendingTrend(ledger, week, "day");
    expect(days.find((d) => d.startDate === "2026-10-13")!.netPaise).toBe(-50_000);
    expect(days.reduce((s, d) => s + d.netPaise, 0)).toBe(categoryBreakdown(ledger, week).netPaise);
  });
});

describe("comparePeriods", () => {
  const ledger = [
    teaAt(1500, "2026-10-05"),
    teaAt(1500, "2026-10-06"),
    expense(2000, { categoryId: FOOD, subcategoryId: SNACKS, occurredAt: ist("2026-10-07") }),
    teaAt(1500, "2026-10-12"),
    expense(2000, { categoryId: FOOD, subcategoryId: SNACKS, occurredAt: ist("2026-10-12") }),
    expense(4500, { categoryId: FOOD, subcategoryId: SNACKS, occurredAt: ist("2026-10-13") }),
    expense(2000, { categoryId: TRANSPORT, subcategoryId: BUS, occurredAt: ist("2026-10-14") }),
  ];

  it("reports the change vs the previous period and its main driver", () => {
    const cmp = comparePeriods(
      categoryBreakdown(ledger, week),
      categoryBreakdown(ledger, lastWeek),
    );
    expect(cmp.comparable).toBe(true);
    expect(cmp.total).toEqual({
      currentPaise: 10_000,
      previousPaise: 5_000,
      deltaPaise: 5_000,
      deltaBp: 10_000,
    });
    const food = cmp.categories.find((c) => c.key === FOOD)!;
    expect(food.deltaPaise).toBe(3_000);
    expect(food.mainDriver).toMatchObject({ key: SNACKS, deltaPaise: 4_500 });
    const transport = cmp.categories.find((c) => c.key === TRANSPORT)!;
    expect(transport).toMatchObject({ previousPaise: 0, deltaPaise: 2_000, deltaBp: null }); // no baseline
  });

  it("marks sparse data as not comparable instead of inventing a trend", () => {
    const sparse = [
      teaAt(1500, "2026-10-06"),
      teaAt(1500, "2026-10-12"),
      teaAt(1500, "2026-10-13"),
      teaAt(1500, "2026-10-14"),
    ];
    const cmp = comparePeriods(
      categoryBreakdown(sparse, week),
      categoryBreakdown(sparse, lastWeek),
    );
    expect(cmp.comparable).toBe(false);
    expect(cmp.reason).toMatch(/only 1 purchase;/);
    expect(cmp.total.deltaPaise).toBe(3000); // numbers are still exact
  });
});

describe("spendingTrend", () => {
  it("buckets net spending per local day, including empty days and midnight edges", () => {
    const ledger = [
      teaAt(1500, "2026-10-12"),
      expense(2000, { occurredAt: ist("2026-10-13", "00:00") }),
      expense(1000, { occurredAt: ist("2026-10-12", "23:59") }),
    ];
    const trend = spendingTrend(ledger, week, "day");
    expect(trend).toHaveLength(7);
    expect(trend[0]).toMatchObject({ startDate: "2026-10-12", netPaise: 2500, count: 2 });
    expect(trend[1]).toMatchObject({ startDate: "2026-10-13", netPaise: 2000, count: 1 });
    expect(trend.slice(2).every((d) => d.netPaise === 0)).toBe(true);
    expect(trend.reduce((s, d) => s + d.netPaise, 0)).toBe(
      categoryBreakdown(ledger, week).netPaise,
    );
  });

  it("buckets by week and month", () => {
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    const weeks = spendingTrend(
      [teaAt(1500, "2026-10-01"), teaAt(1500, "2026-10-14")],
      oct,
      "week",
    );
    expect(weeks.map((w) => w.startDate)).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
    expect(weeks[0]!.netPaise).toBe(1500);
    expect(spendingTrend([], oct, "month")).toEqual([
      { startDate: "2026-10-01", netPaise: 0, count: 0, transactionIds: [] },
    ]);
  });
});
