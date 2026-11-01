/**
 * The Phase 7 promise: every figure on Insights and Money leaks equals what history shows for the
 * same period and filters. Each figure's link is parsed exactly as the history page parses its
 * URL, then filtered and totalled by the same functions, and compared id for id.
 */
import { describe, expect, it } from "vitest";

import {
  type CategoryGroup,
  type Category,
  PURCHASE_GROUPINGS,
  type Transaction,
  UNCATEGORIZED,
  buildInsights,
  categorySchema,
  formatINR,
  indexById,
  leakReport,
  netSpending,
  periodScope,
  resolvePeriod,
  comparisonWindows,
  recurringSignals,
  trendView,
} from "@/domain";
import { filterHistory, parseHistoryFilters } from "@/lib/history";
import {
  type InsightSelection,
  categoryNamer,
  historyHref,
  insightWords,
  parseInsightSelection,
} from "@/lib/insights-view";

import {
  BUS,
  CASH,
  BANK,
  FOOD,
  OWNER,
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
} from "./domain/fixtures";

const NOW = istMs("2026-10-21", "18:00");
const TODAY = "2026-10-21";
const IST = { timeZone: "Asia/Kolkata", weekStartsOn: 1 } as const;
const THRESHOLD = 5_000;

const category = (id: string, name: string, parentId: string | null = null): Category =>
  categorySchema.parse({ id, ownerId: OWNER, name, parentId });
const categories = [
  category(FOOD, "Food & Drinks"),
  category(TEA, "Tea", FOOD),
  category(SNACKS, "Snacks", FOOD),
  category(TRANSPORT, "Transport"),
  category(BUS, "Bus", TRANSPORT),
];

const lateRefunded = expense(9_000, {
  description: "Coffee",
  subcategoryId: SNACKS,
  occurredAt: ist("2026-09-28"),
});
const smallRefunded = expense(2_500, {
  description: "Coffee",
  occurredAt: ist("2026-10-20"),
  merchant: "CCD",
});
const bigRefunded = expense(90_000, {
  description: "Shoes",
  categoryId: TRANSPORT,
  occurredAt: ist("2026-10-07"),
});

/** A ledger that exercises every rule that could make two screens disagree. */
const ledger: Transaction[] = [
  lateRefunded,
  smallRefunded,
  bigRefunded,
  // Week and month edges, at exact IST midnights.
  expense(1_500, {
    description: "tea",
    subcategoryId: TEA,
    occurredAt: ist("2026-10-01", "00:00"),
  }),
  expense(1_500, {
    description: "Tea",
    subcategoryId: TEA,
    occurredAt: ist("2026-09-30", "23:59"),
  }),
  expense(1_500, {
    description: "teas",
    subcategoryId: TEA,
    occurredAt: ist("2026-10-19", "00:00"),
  }),
  expense(1_500, {
    description: "Tea",
    subcategoryId: TEA,
    occurredAt: ist("2026-10-18", "23:59"),
  }),
  // Repeats across wallets, merchants, a tile and no description.
  ...[2, 5, 12, 20].map((day) =>
    expense(2_500, {
      description: "Coffee",
      merchant: day % 2 ? "CCD" : "Starbucks",
      source: "quick_add",
      occurredAt: ist(`2026-10-${String(day).padStart(2, "0")}`),
    }),
  ),
  expense(4_000, {
    description: null,
    categoryId: TRANSPORT,
    subcategoryId: BUS,
    occurredAt: ist("2026-10-06"),
  }),
  expense(4_000, {
    description: null,
    categoryId: TRANSPORT,
    subcategoryId: BUS,
    occurredAt: ist("2026-10-13"),
  }),
  expense(4_000, {
    description: null,
    categoryId: TRANSPORT,
    subcategoryId: BUS,
    occurredAt: ist("2026-10-20"),
  }),
  // Unassigned, spending and income: only spending belongs to the Unassigned group.
  expense(3_000, { description: "Mystery", categoryId: null, occurredAt: ist("2026-10-09") }),
  expense(3_000, { description: "Mystery", categoryId: null, occurredAt: ist("2026-10-10") }),
  expense(3_000, { description: "Mystery", categoryId: null, occurredAt: ist("2026-10-11") }),
  income(40_000, { categoryId: null, occurredAt: ist("2026-10-09") }),
  // A monthly bill, for a recurring signal.
  ...["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"].map((d) =>
    expense(200_000, { description: "Mess fee", occurredAt: ist(d) }),
  ),
  // Refunds: later period, inherited and own category, small and big purchases.
  refund(9_000, lateRefunded.id, { occurredAt: ist("2026-10-04") }),
  refund(2_500, smallRefunded.id, { occurredAt: ist("2026-10-21") }),
  refund(2_000, bigRefunded.id, {
    categoryId: FOOD,
    subcategoryId: TEA,
    occurredAt: ist("2026-10-08"),
  }),
  // Never spending.
  income(500_000, { occurredAt: ist("2026-10-01") }),
  transfer(100_000, CASH, BANK, { occurredAt: ist("2026-10-02") }),
  allocate(50_000, undefined, { occurredAt: ist("2026-10-03") }),
  release(10_000, undefined, { occurredAt: ist("2026-10-04") }),
  // Excluded from every total.
  expense(7_700, {
    description: "Coffee",
    occurredAt: ist("2026-10-14"),
    voidedAt: ist("2026-10-15"),
  }),
];

const ctx = {
  categoriesById: new Map(categories.map((c) => [c.id, c])),
  accountsById: new Map(),
  ledgerById: indexById(ledger),
  timeZone: IST.timeZone,
};
const allTime = resolvePeriod({ kind: "all_time" }, NOW, IST);

/** What the history page does with a URL. */
function history(href: string) {
  const query = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
  const rows = filterHistory(ledger, parseHistoryFilters(query).filters, ctx);
  return { ids: rows.map((tx) => tx.id).sort(), net: netSpending(rows, allTime), rows };
}

function expectSame(label: string, href: string, figure: { net: number; ids?: readonly string[] }) {
  const seen = history(href);
  expect(seen.net, `${label} total via ${href}`).toBe(figure.net);
  if (figure.ids) expect(seen.ids, `${label} entries via ${href}`).toEqual([...figure.ids].sort());
}

const SELECTIONS: Record<string, string>[] = [
  { period: "today" },
  { period: "this_week" },
  { period: "this_month" },
  { period: "previous_week" },
  { period: "previous_month" },
  { period: "custom", from: "2026-09-30", to: "2026-10-10" },
  { period: "all_time" },
];

describe.each(SELECTIONS)("reconciliation for $period", (params) => {
  const selection: InsightSelection = parseInsightSelection(params, NOW, IST);
  const { period } = selection;
  const words = insightWords(selection, TODAY, categories, "INR");
  const model = buildInsights({
    ledger,
    period,
    today: TODAY,
    settings: IST,
    thresholdPaise: THRESHOLD,
    words,
  });
  const scope = { type: "spending", ...periodScope(period) } as const;

  it("the headline total and every category and subcategory match history", () => {
    const { breakdown } = model;
    expectSame("net spending", historyHref(scope), { net: breakdown.netPaise });
    const check = (group: CategoryGroup) => {
      expectSame(`category ${group.key}`, historyHref({ ...scope, category: group.key }), {
        net: group.netPaise,
        ids: group.transactionIds,
      });
      for (const sub of group.subcategories) {
        const none = sub.key === UNCATEGORIZED;
        expectSame(
          `subcategory ${sub.key}`,
          historyHref({
            ...scope,
            category: none ? group.key : sub.key,
            noSubcategory: none,
          }),
          { net: sub.netPaise, ids: sub.transactionIds },
        );
      }
    };
    breakdown.categories.forEach(check);
  });

  it("income is shown separately and matches history", () => {
    const seen = history(historyHref({ type: "income", ...periodScope(period) }));
    expect(seen.rows.reduce((sum, tx) => sum + tx.amountPaise, 0)).toBe(model.income.paise);
    expect(seen.rows).toHaveLength(model.income.count);
    expect(seen.net).toBe(0); // income never enters net spending
  });

  it("refunds match history as their own line", () => {
    const seen = history(historyHref({ type: "refund", ...periodScope(period) }));
    expect(seen.rows.reduce((sum, tx) => sum + tx.amountPaise, 0)).toBe(
      model.breakdown.refundsPaise,
    );
  });

  it("the small-purchase total matches history", () => {
    expectSame("small", historyHref({ ...scope, underPaise: THRESHOLD }), {
      net: model.small.netPaise,
      ids: model.small.transactionIds,
    });
  });

  it("every trend bar matches history, at every granularity on offer", () => {
    const base = trendView(ledger, period, TODAY, IST, null);
    for (const granularity of base.options) {
      const view = trendView(ledger, period, TODAY, IST, granularity);
      for (const point of view.points) {
        expectSame(
          `${granularity} bar ${point.startDate}`,
          historyHref({ type: "spending", from: point.from, to: point.to }),
          { net: point.netPaise, ids: point.transactionIds },
        );
      }
    }
  });

  it("every one category's trend bar matches history", () => {
    const view = trendView(ledger, period, TODAY, IST, null, (entry) => entry.categoryId === FOOD);
    for (const point of view.points) {
      expectSame(
        `food bar ${point.startDate}`,
        historyHref({ type: "spending", category: FOOD, from: point.from, to: point.to }),
        { net: point.netPaise, ids: point.transactionIds },
      );
    }
  });

  it("every most-frequent row matches history", () => {
    for (const group of [...model.frequent, ...model.merchants]) {
      expectSame(`frequent ${group.key}`, historyHref({ ...scope, by: group.by, key: group.key }), {
        net: group.netPaise,
        ids: group.transactionIds,
      });
    }
  });

  it("every insight card and unusual change opens its own entries", () => {
    for (const card of model.cards) {
      expectSame(`card ${card.id}`, historyHref(card.scope), { net: card.paise });
    }
    for (const item of model.unusual) {
      if (item.currentPaise !== 0) {
        expectSame(`unusual ${item.key}`, historyHref(item.scope), { net: item.currentPaise });
      }
    }
  });

  it("every comparison figure matches history for both windows", () => {
    if (!model.comparison || !model.previousWindow) return;
    const windows = comparisonWindows(period, TODAY, 1)!;
    expectSame(
      "current window",
      historyHref({ type: "spending", ...periodScope(windows.current) }),
      { net: model.comparison.total.currentPaise },
    );
    expectSame(
      "previous window",
      historyHref({ type: "spending", ...periodScope(model.previousWindow) }),
      { net: model.comparison.total.previousPaise },
    );
  });

  it.each(PURCHASE_GROUPINGS)("every leak group by %s matches history", (by) => {
    const previous = comparisonWindows(period, TODAY, 1)?.previous[0] ?? null;
    const report = leakReport({
      ledger,
      period,
      previous,
      by,
      thresholdPaise: THRESHOLD,
      labelOf: categoryNamer(categories),
    });
    const leakScope = { ...scope, underPaise: THRESHOLD, by };
    for (const group of report.groups) {
      expectSame(`leak ${by}:${group.key}`, historyHref({ ...leakScope, key: group.key }), {
        net: group.netPaise,
        ids: group.transactionIds,
      });
      if (previous && group.comparison) {
        expectSame(
          `leak previous ${by}:${group.key}`,
          historyHref({ ...leakScope, ...periodScope(previous), key: group.key }),
          { net: group.comparison.previousPaise },
        );
      }
    }
  });
});

describe("reconciliation details", () => {
  it("the fixture really exercises the awkward cases", () => {
    const month = parseInsightSelection({ period: "this_month" }, NOW, IST);
    const words = insightWords(month, TODAY, categories, "INR");
    const model = buildInsights({
      ledger,
      period: month.period,
      today: TODAY,
      settings: IST,
      thresholdPaise: THRESHOLD,
      words,
    });
    const keys = model.breakdown.categories.map((c) => c.key);
    expect(keys).toContain(UNCATEGORIZED);
    expect(model.breakdown.refundsPaise).toBe(13_500);
    expect(model.cards.length).toBeGreaterThan(2);
    expect(model.frequent.length).toBeGreaterThan(0);
    expect(model.merchants.length).toBeGreaterThan(0);
    expect(model.recurring.map((r) => r.label)).toContain("Mess fee");
    expect(
      leakReport({
        ledger,
        period: month.period,
        previous: null,
        by: "description",
        thresholdPaise: THRESHOLD,
      }).groups.length,
    ).toBeGreaterThan(0);
  });

  it("a recurring signal's link matches history across all time", () => {
    for (const signal of recurringSignals(ledger, TODAY, IST)) {
      expectSame(
        `recurring ${signal.key}`,
        historyHref({ type: "spending", from: null, to: null, by: signal.by, key: signal.key }),
        { net: signal.netPaise, ids: signal.transactionIds },
      );
    }
  });

  it("the Unassigned drill-down leaves out unassigned income", () => {
    const href = historyHref({
      type: "spending",
      from: "2026-10-01",
      to: "2026-10-31",
      category: UNCATEGORIZED,
    });
    expect(history(href).rows.every((tx) => tx.type === "expense")).toBe(true);
    expect(history(href).rows).toHaveLength(3);
  });

  it("a voided entry stays in plain history but out of every spending view", () => {
    const voided = ledger.find((tx) => tx.voidedAt !== null)!;
    expect(history("/transactions?").ids).toContain(voided.id);
    expect(history(historyHref({ type: "spending", from: null, to: null })).ids).not.toContain(
      voided.id,
    );
  });

  it("names Unassigned, and never folds it into another category", () => {
    expect(categoryNamer(categories)(UNCATEGORIZED)).toBe("Unassigned");
    expect(categoryNamer(categories)(TEA)).toBe("Food & Drinks › Tea");
  });

  it("uses money formatting from the profile currency, not rupees", () => {
    const month = parseInsightSelection({ period: "this_month" }, NOW, IST);
    const words = insightWords(month, TODAY, categories, "USD");
    expect(words.money(2_500)).toBe("$25");
    expect(formatINR(2_500)).toBe("₹25");
  });
});

describe("period selection", () => {
  it("defaults to this month", () => {
    expect(parseInsightSelection({}, NOW, IST).kind).toBe("this_month");
    expect(parseInsightSelection({ period: "nonsense" }, NOW, IST).kind).toBe("this_month");
  });

  it("refuses a bad custom range out loud instead of guessing", () => {
    const backwards = parseInsightSelection(
      { period: "custom", from: "2026-10-10", to: "2026-10-01" },
      NOW,
      IST,
    );
    expect(backwards.error).toMatch(/before the start date/);
    expect(backwards.period.kind).toBe("this_month");
    const invalid = parseInsightSelection(
      { period: "custom", from: "2026-02-31", to: "2026-03-01" },
      NOW,
      IST,
    );
    expect(invalid.error).toMatch(/valid/);
  });

  it("uses the profile's timezone and week start", () => {
    const sunday = { timeZone: "America/New_York", weekStartsOn: 0 } as const;
    const { period } = parseInsightSelection({ period: "this_week" }, NOW, sunday);
    expect(period.startDate).toBe("2026-10-18");
    expect(period.timeZone).toBe("America/New_York");
  });
});
