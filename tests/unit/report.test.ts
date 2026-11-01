// @vitest-environment node
/**
 * The Phase 9 promise: the report says the same as Insights and History for the same period, its
 * balances are rebuilt from dated entries, and the CSV and PDF carry exactly those numbers.
 */
import { describe, expect, it } from "vitest";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import {
  type Category,
  type ReportOptions,
  type Transaction,
  buildInsights,
  buildReport,
  categorySchema,
  comparisonWindows,
  consolidatedBalanceAt,
  formatINR,
  indexById,
  netSpending,
  periodScope,
  reportCsv,
  reportDifferences,
  reportText,
  resolvePeriod,
  transactionsInPeriod,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";
import { filterHistory, parseHistoryFilters } from "@/lib/history";
import { historyHref, insightWords, parseInsightSelection } from "@/lib/insights-view";
import { reportPdf } from "@/lib/reports/pdf";
import { parseReportOptions, reportQuery } from "@/lib/reports/params";

import {
  BANK,
  BUS,
  CASH,
  FOOD,
  LAPTOP_GOAL,
  OWNER,
  TEA,
  TRANSPORT,
  account,
  allocate,
  expense,
  income,
  ist,
  istMs,
  refund,
  release,
  transfer,
} from "./domain/fixtures";

const NOW = istMs("2026-11-10", "18:00");
const TODAY = "2026-11-10";
const IST = { timeZone: "Asia/Kolkata", weekStartsOn: 1 } as const;

const category = (id: string, name: string, parentId: string | null = null): Category =>
  categorySchema.parse({ id, ownerId: OWNER, name, parentId });
const categories = [
  category(FOOD, "Food & Drinks"),
  category(TEA, "Tea", FOOD),
  category(TRANSPORT, "Transport"),
  category(BUS, "Bus", TRANSPORT),
];

const accounts = [account(CASH, 100_000, "2026-09-01"), account(BANK, 500_000, "2026-09-01")];

const refundedLate = expense(9_000, { description: "Shoes", occurredAt: ist("2026-09-28") });
const refundedSame = expense(40_000, {
  description: "Bag",
  categoryId: TRANSPORT,
  occurredAt: ist("2026-10-07"),
});
const ledger: Transaction[] = [
  refundedLate,
  refundedSame,
  // Exact IST month edges.
  expense(1_500, {
    subcategoryId: TEA,
    description: "Tea",
    occurredAt: ist("2026-10-01", "00:00"),
  }),
  expense(1_700, {
    subcategoryId: TEA,
    description: "Tea",
    occurredAt: ist("2026-09-30", "23:59"),
  }),
  expense(1_900, {
    subcategoryId: TEA,
    description: "Tea",
    occurredAt: ist("2026-10-31", "23:59"),
  }),
  expense(2_100, {
    subcategoryId: TEA,
    description: "Tea",
    occurredAt: ist("2026-11-01", "00:00"),
  }),
  expense(4_000, { categoryId: TRANSPORT, subcategoryId: BUS, occurredAt: ist("2026-10-06") }),
  expense(3_000, {
    categoryId: null,
    description: "Mystery",
    note: "=HYPERLINK(evil)",
    occurredAt: ist("2026-10-09"),
  }),
  income(200_000, { categoryId: null, occurredAt: ist("2026-10-02") }),
  income(150_000, { categoryId: null, occurredAt: ist("2026-11-02") }),
  refund(9_000, refundedLate.id, { occurredAt: ist("2026-10-04") }),
  refund(5_000, refundedSame.id, { occurredAt: ist("2026-10-08") }),
  transfer(50_000, CASH, BANK, { occurredAt: ist("2026-10-05") }),
  allocate(20_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-05") }),
  release(5_000, LAPTOP_GOAL, { occurredAt: ist("2026-10-06") }),
];

const all: ReportOptions = {
  includeTransactions: true,
  includeNotes: true,
  compare: true,
  hiddenCategoryIds: [],
};

function reportOf(
  query: Record<string, string>,
  options: Partial<ReportOptions> = {},
  rows: readonly Transaction[] = ledger,
  wallets = accounts,
) {
  const selection = parseInsightSelection(query, NOW, IST);
  const windows = comparisonWindows(selection.period, TODAY, 1);
  const label = insightWords(selection, TODAY, categories, "INR").previous;
  return {
    selection,
    report: buildReport({
      accounts: wallets,
      ledger: rows,
      categories,
      period: selection.period,
      periodLabel: "1 Oct 2026 to 31 Oct 2026",
      comparison:
        windows?.previous[0] && label
          ? { current: windows.current, previous: windows.previous[0], label }
          : null,
      now: NOW,
      settings: IST,
      currency: "INR",
      options: { ...all, ...options },
    }),
  };
}

const PERIODS: [string, Record<string, string>][] = [
  ["a finished month", { period: "previous_month" }],
  ["the running month", { period: "this_month" }],
  ["a custom range", { period: "custom", from: "2026-10-05", to: "2026-10-09" }],
  ["all time", { period: "all_time" }],
];

describe.each(PERIODS)("%s matches Insights and History", (_, query) => {
  const { selection, report } = reportOf(query);
  const { period } = selection;
  const words = insightWords(selection, TODAY, categories, "INR");
  const insights = buildInsights({
    ledger,
    period,
    today: TODAY,
    settings: IST,
    thresholdPaise: 5_000,
    words,
  });
  const ctx = {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById: new Map(),
    ledgerById: indexById(ledger),
    timeZone: IST.timeZone,
  };
  const allTime = resolvePeriod({ kind: "all_time" }, NOW, IST);
  const history = (scope: Parameters<typeof historyHref>[0]) => {
    const href = historyHref(scope);
    const params = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    return filterHistory(ledger, parseHistoryFilters(params).filters, ctx);
  };
  const scope = periodScope(period);

  it("has the same spending, refunds and income as Insights", () => {
    expect(report.netSpendingPaise).toBe(insights.breakdown.netPaise);
    expect(report.expensesPaise).toBe(insights.breakdown.grossPaise);
    expect(report.refundsPaise).toBe(insights.breakdown.refundsPaise);
    expect(report.expenseCount).toBe(insights.breakdown.expenseCount);
    expect(report.incomePaise).toBe(insights.income.paise);
    expect(report.incomeCount).toBe(insights.income.count);
  });

  it("has the same category figures as Insights, row for row", () => {
    expect(report.categories.map((c) => [c.key, c.netPaise, c.count, c.shareBp])).toEqual(
      insights.breakdown.categories.map((c) => [c.key, c.netPaise, c.count, c.shareBp]),
    );
  });

  it("has the same totals as History", () => {
    expect(netSpending(history({ type: "spending", ...scope }), allTime)).toBe(
      report.netSpendingPaise,
    );
    const income = history({ type: "income", ...scope });
    expect(income).toHaveLength(report.incomeCount);
    expect(income.reduce((sum, tx) => sum + tx.amountPaise, 0)).toBe(report.incomePaise);
  });

  it("adds up", () => {
    expect(reportDifferences(report)).toEqual({ balance: 0, spending: 0, purchases: 0 });
  });
});

describe("balances for a historical period", () => {
  const { report } = reportOf({ period: "previous_month" });

  it("are rebuilt from dated entries, not today's balance", () => {
    // 6,00,000 opening − September's 9,000 and 1,700 at 23:59 on the 30th.
    expect(report.openingPaise).toBe(600_000 - 9_000 - 40_000 * 0 - 1_700);
    expect(report.provisional).toBe(false);
    expect(report.closingAsOf).toBe("2026-10-31");
    const atEnd = consolidatedBalanceAt(
      accounts,
      ledger,
      istMs("2026-11-01", "00:00"),
      IST.timeZone,
    );
    expect(report.closingPaise).toBe(atEnd.balancePaise);
    const today = consolidatedBalanceAt(accounts, ledger, NOW, IST.timeZone).balancePaise;
    expect(report.closingPaise).not.toBe(today);
  });

  it("a month's edges at IST midnight stay in the right month", () => {
    const dates = report.transactions!.map((row) => row.date);
    expect(dates).toContain("2026-10-01");
    expect(dates).toContain("2026-10-31");
    expect(dates).not.toContain("2026-09-30");
    expect(dates).not.toContain("2026-11-01");
  });

  it("a running period is marked as such", () => {
    const running = reportOf({ period: "this_month" }).report;
    expect(running.provisional).toBe(true);
    expect(running.closingAsOf).toBe(TODAY);
  });

  it("transfers and goal moves change neither income, spending nor the balance", () => {
    expect(report.transferredPaise).toBe(50_000);
    expect(report.setAsidePaise).toBe(20_000);
    expect(report.releasedPaise).toBe(5_000);
    expect(report.netMovementPaise).toBe(200_000 + 14_000 - report.expensesPaise);
    expect(report.closingPaise - report.openingPaise).toBe(report.netMovementPaise);
  });

  it("an entry before a wallet's opening date counts as spending, and the gap is shown", () => {
    const wallets = [account(CASH, 100_000, "2026-10-10")];
    const old = expense(7_000, { occurredAt: ist("2026-10-03") });
    const later = expense(2_000, { occurredAt: ist("2026-10-12") });
    const { report: r } = reportOf({ period: "previous_month" }, {}, [old, later], wallets);
    expect(r.expensesPaise).toBe(9_000);
    expect(r.beforeTrackingPaise).toBe(-7_000);
    expect(r.newlyTrackedPaise).toBe(100_000);
    expect(r.closingPaise).toBe(98_000);
    expect(reportDifferences(r).balance).toBe(0);
  });

  it("deleted and voided entries are in nothing", () => {
    const gone = expense(77_700, { occurredAt: ist("2026-10-15"), deletedAt: ist("2026-10-16") });
    const voided = expense(66_600, { occurredAt: ist("2026-10-15"), voidedAt: ist("2026-10-16") });
    const before = reportOf({ period: "previous_month" }).report;
    const after = reportOf({ period: "previous_month" }, {}, [...ledger, gone, voided]).report;
    expect(after.netSpendingPaise).toBe(before.netSpendingPaise);
    expect(after.closingPaise).toBe(before.closingPaise);
    expect(after.transactions!.map((r) => r.id)).not.toContain(gone.id);
  });
});

describe("what's included", () => {
  it("leaves entries and notes out unless asked", () => {
    const { report } = reportOf(
      { period: "previous_month" },
      {
        includeTransactions: false,
        includeNotes: false,
      },
    );
    expect(report.transactions).toBeNull();
    const notes = reportOf({ period: "previous_month" }, { includeNotes: false }).report;
    expect(notes.transactions!.every((row) => row.note === null)).toBe(true);
  });

  it("hiding a category removes its name and entries, and the totals still add up", () => {
    const plain = reportOf({ period: "previous_month" }).report;
    const { report } = reportOf({ period: "previous_month" }, { hiddenCategoryIds: [TRANSPORT] });
    expect(report.categories.map((c) => c.label)).not.toContain("Transport");
    expect(report.hiddenRow).not.toBeNull();
    expect(report.netSpendingPaise).toBe(plain.netSpendingPaise);
    expect(report.closingPaise).toBe(plain.closingPaise);
    expect(reportDifferences(report)).toEqual({ balance: 0, spending: 0, purchases: 0 });
    expect(report.transactions!.some((r) => r.category.startsWith("Transport"))).toBe(false);
    expect(reportCsv(report)).not.toContain("Transport");
    expect(reportText(report, formatINR, formatLocalDate)).not.toContain("Transport");
  });

  it("reads and keeps its choices in the URL, including ticked boxes", () => {
    const profile = { includeNotesInReports: false };
    expect(parseReportOptions({}, profile)).toEqual({
      includeTransactions: false,
      includeNotes: false,
      compare: true,
      hiddenCategoryIds: [],
    });
    const ticked = parseReportOptions(
      { details: ["0", "1"], notes: "0", compare: "0", hide: [TEA, BUS] },
      { includeNotesInReports: true },
    );
    expect(ticked).toEqual({
      includeTransactions: true,
      includeNotes: false,
      compare: false,
      hiddenCategoryIds: [TEA, BUS],
    });
    const selection = parseInsightSelection({ period: "previous_month" }, NOW, IST);
    const again = new URLSearchParams(reportQuery(selection, ticked));
    expect(parseReportOptions(Object.fromEntries(again), { includeNotesInReports: true })).toEqual(
      ticked,
    );
  });

  it("compares fairly, or not at all", () => {
    const { report } = reportOf({ period: "this_month" });
    expect(report.comparison?.label).toMatch(/same days/);
    expect(report.comparison?.sparse).toBe(true);
    expect(reportOf({ period: "all_time" }).report.comparison).toBeNull();
    expect(reportOf({ period: "this_month" }, { compare: false }).report.comparison).toBeNull();
  });
});

describe("CSV", () => {
  const { report } = reportOf({ period: "previous_month" });
  const csv = reportCsv(report);
  const lines = csv.trimEnd().split("\r\n");

  it("starts with a byte-order mark, so spreadsheets read ₹ and notes correctly", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toContain("Date,Time,Type");
  });

  it("has one row per entry, whose amounts sum to the report", () => {
    expect(lines).toHaveLength(report.transactions!.length + 1);
    const moneyEntries = transactionsInPeriod(ledger, report.period).filter(
      (tx) => tx.type !== "allocation" && tx.type !== "allocation_release",
    );
    expect(report.transactions).toHaveLength(moneyEntries.length);
    const signed = report.transactions!.reduce((sum, row) => sum + row.signedPaise, 0);
    expect(signed).toBe(report.netMovementPaise);
  });

  it("writes plain decimal amounts, with no symbol or grouping", () => {
    const row = lines.find((line) => line.includes("Income"))!;
    expect(row).toContain("INR,2000.00,2000.00");
    const tea = lines.find((line) => line.includes("2026-10-01"))!;
    expect(tea).toContain("INR,15.00,-15.00");
    expect(csv).not.toContain("₹");
  });

  it("can't smuggle a formula into a spreadsheet", () => {
    expect(csv).toContain("'=HYPERLINK(evil)");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("quotes commas, quotes and new lines", () => {
    const tricky = expense(100, {
      description: 'tea, "extra"\nhot',
      occurredAt: ist("2026-10-15"),
    });
    const text = reportCsv(reportOf({ period: "previous_month" }, {}, [tricky]).report);
    expect(text).toContain('"tea, ""extra""\nhot"');
  });

  it("without entries, gives category and subcategory rows that sum to the report", () => {
    const summary = reportOf({ period: "previous_month" }, { includeTransactions: false }).report;
    const rows = reportCsv(summary).trimEnd().split("\r\n");
    expect(rows[0]).toContain("Category,Subcategory,Purchases");
    const mains = rows.slice(1).filter((line) => line.split(",")[1] === "");
    const net = mains.reduce((sum, line) => sum + Math.round(Number(line.split(",")[6]) * 100), 0);
    expect(net).toBe(summary.netSpendingPaise);
  });
});

describe("text summary", () => {
  it("has the figures, labels a historical balance, and says it isn't bank-verified", () => {
    const { report } = reportOf({ period: "previous_month" });
    const text = reportText(report, formatINR, formatLocalDate);
    expect(text).toContain(`Closing balance on 31 Oct 2026: ${formatINR(report.closingPaise)}`);
    expect(text).toContain(`Income: ${formatINR(report.incomePaise)}`);
    expect(text).toContain("not verified by a bank");
    expect(text).not.toContain("NaN");
  });
});

// Reading each PDF back takes a few seconds when the whole suite runs at once.
describe("PDF", { timeout: 30_000 }, () => {
  async function textOf(bytes: Uint8Array) {
    const doc = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
    }
    return { pages: doc.numPages, text: pages.join("\n") };
  }

  it("is a real PDF holding the report's figures, ₹ included", async () => {
    const { report } = reportOf({ period: "previous_month" });
    const bytes = await reportPdf(report);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const { text } = await textOf(bytes);
    expect(text).toContain("Expense report");
    expect(text).toContain("1 Oct 2026 to 31 Oct 2026");
    for (const paise of [
      report.openingPaise,
      report.incomePaise,
      report.netMovementPaise,
      report.closingPaise,
    ]) {
      expect(text).toContain(formatINR(paise));
    }
    expect(text).toContain("Food & Drinks");
    expect(text).toContain("Not verified by a bank");
  });

  it("runs onto more pages, numbered, and leaves out what was left out", async () => {
    const many = Array.from({ length: 90 }, (_, i) =>
      expense(1_000 + i, {
        description: `Entry ${i}`,
        note: "private note",
        occurredAt: ist("2026-10-15"),
      }),
    );
    const { report } = reportOf({ period: "previous_month" }, {}, many);
    const { pages, text } = await textOf(await reportPdf(report));
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`Page ${pages} of ${pages}`);
    expect(text).toContain("Entry 89");
    const hidden = reportOf({ period: "previous_month" }, { includeNotes: false }, many).report;
    expect((await textOf(await reportPdf(hidden))).text).not.toContain("private note");
  });

  it("survives characters its font doesn't have", async () => {
    const odd = expense(100, { description: "Chai 😀 ☕ 中", occurredAt: ist("2026-10-15") });
    const { report } = reportOf({ period: "previous_month" }, {}, [odd]);
    expect((await textOf(await reportPdf(report))).text).toContain("Chai");
  });

  it("works for a period with nothing in it", async () => {
    const { report } = reportOf({ period: "previous_month" }, {}, []);
    expect((await textOf(await reportPdf(report))).text).toContain("Nothing was spent");
  });
});
