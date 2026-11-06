/**
 * Parent Report: one model for the preview, PDF, CSV and text, so the four can't disagree. Its
 * spending and income come from the same functions as Insights and History, and its balances from
 * `summarizePeriod`, rebuilt from dated ledger activity rather than today's balance.
 *
 * One honest gap can exist between those: an entry dated before its wallet's opening date is real
 * spending, so Insights and History include it, but it's already inside the opening balance, so it
 * doesn't move the balance. The report keeps the Insights figures and shows that difference as its
 * own line (`beforeTrackingPaise`), so the sums still add up on the page.
 *
 * Hiding a category removes its row and its entries from what's shared, never from the totals:
 * they gather in one "Other categories" row, because a total that changed with a filter wouldn't
 * reconcile with the ledger.
 */
import {
  type CategoryBreakdown,
  UNCATEGORIZED,
  categoryBreakdown,
  change,
  type Change,
  transactionsInPeriod,
} from "./aggregation";
import { type LedgerBalances, type PeriodSummary, summarizePeriod } from "./balances";
import { categoryLabel, resolveCategoryChoice } from "./categorize";
import { csvDocument } from "./csv";
import { indexById, occurredAtMs, refundCategory } from "./ledger";
import {
  type Paise,
  addPaise,
  formatBasisPoints,
  paiseToDecimalString,
  subtractPaise,
  sumPaise,
} from "./money";
import type { CurrencyCode } from "./money";
import type { Account, Category, Transaction } from "./schemas";
import {
  type Instant,
  type LocalDate,
  type Period,
  type TimeSettings,
  toLocalDate,
  toLocalTime,
} from "./time";

export interface ReportOptions {
  includeTransactions: boolean;
  includeNotes: boolean;
  compare: boolean;
  hiddenCategoryIds: readonly string[];
}

export interface ReportCategoryRow {
  key: string;
  label: string;
  count: number;
  grossPaise: Paise;
  refundsPaise: Paise;
  netPaise: Paise;
  shareBp: number | null;
  subcategories: Omit<ReportCategoryRow, "subcategories">[];
}

export interface ReportTransactionRow {
  id: string;
  date: LocalDate;
  time: string;
  type: "income" | "expense" | "refund" | "transfer";
  description: string;
  category: string;
  wallet: string;
  amountPaise: Paise;
  /** + money in, − money out, 0 moved between own wallets. */
  signedPaise: Paise;
  note: string | null;
}

export interface ReportComparison {
  /** "the same days last month", "the week before". */
  label: string;
  spending: Change;
  income: Change;
  /** Fewer than 3 purchases on either side: figures shown, but no conclusion drawn. */
  sparse: boolean;
}

export interface ParentReport {
  period: Period;
  periodLabel: string;
  currency: CurrencyCode;
  generatedOn: LocalDate;
  /** Still running: closing is "so far", not a final figure. */
  provisional: boolean;
  options: ReportOptions;
  /** null for all time, which starts from the opening balances instead. */
  openingAsOf: LocalDate | null;
  closingAsOf: LocalDate;
  openingPaise: Paise;
  closingPaise: Paise;
  newlyTrackedPaise: Paise;
  incomePaise: Paise;
  incomeCount: number;
  expensesPaise: Paise;
  expenseCount: number;
  refundsPaise: Paise;
  refundCount: number;
  netSpendingPaise: Paise;
  /** income + refunds − expenses. */
  netMovementPaise: Paise;
  /** Entries dated before their wallet's opening date: already in the opening balance. */
  beforeTrackingPaise: Paise;
  transferredPaise: Paise;
  setAsidePaise: Paise;
  releasedPaise: Paise;
  categories: ReportCategoryRow[];
  /** Hidden categories, combined. Null when nothing is hidden. */
  hiddenRow: Pick<ReportCategoryRow, "count" | "netPaise"> | null;
  transactions: ReportTransactionRow[] | null;
  comparison: ReportComparison | null;
}

export const REPORT_DEFINITIONS: readonly (readonly [string, string])[] = [
  ["Opening balance", "Tracked money at the start of the period, rebuilt from dated entries."],
  ["Income", "Money received. Refunds aren’t income."],
  ["Expenses", "What was spent, before refunds."],
  ["Refunds", "Money returned for earlier purchases. It reduces spending."],
  ["Net movement", "Income plus refunds, minus expenses."],
  ["Closing balance", "Opening balance plus net movement."],
  ["Tracked balance", "Only what was recorded in PocketPulse. It isn’t verified by any bank."],
];

const UNASSIGNED = "Unassigned";
const NO_SUBCATEGORY = "No subcategory";
const OTHER_CATEGORIES = "Other categories";

const FAIR_MINIMUM = 3;

function categoryRows(
  breakdown: CategoryBreakdown,
  byId: ReadonlyMap<string, Category>,
  hidden: ReadonlySet<string>,
) {
  const name = (key: string, fallback: string) =>
    key === UNCATEGORIZED ? fallback : (byId.get(key)?.name ?? fallback);
  const rows: ReportCategoryRow[] = [];
  let hiddenCount = 0;
  let hiddenNet = 0;
  let anyHidden = false;
  for (const group of breakdown.categories) {
    if (hidden.has(group.key)) {
      anyHidden = true;
      hiddenCount += group.count;
      hiddenNet = addPaise(hiddenNet, group.netPaise);
      continue;
    }
    rows.push({
      key: group.key,
      label: name(group.key, UNASSIGNED),
      count: group.count,
      grossPaise: group.grossPaise,
      refundsPaise: group.refundsPaise,
      netPaise: group.netPaise,
      shareBp: group.shareBp,
      subcategories: group.subcategories.map((sub) => ({
        key: sub.key,
        label: name(sub.key, NO_SUBCATEGORY),
        count: sub.count,
        grossPaise: sub.grossPaise,
        refundsPaise: sub.refundsPaise,
        netPaise: sub.netPaise,
        shareBp: sub.shareBp,
      })),
    });
  }
  return { rows, hiddenRow: anyHidden ? { count: hiddenCount, netPaise: hiddenNet } : null };
}

function transactionRows(
  ledger: readonly Transaction[],
  period: Period,
  hidden: ReadonlySet<string>,
  context: {
    accounts: ReadonlyMap<string, Account>;
    categories: ReadonlyMap<string, Category>;
    timeZone: string;
    includeNotes: boolean;
  },
): ReportTransactionRow[] {
  const byId = indexById(ledger);
  const wallet = (id: string) => context.accounts.get(id)?.name ?? "Wallet";
  const rows: ReportTransactionRow[] = [];
  for (const tx of transactionsInPeriod(ledger, period)) {
    // Moves into and out of savings goals aren't money coming in or going out.
    if (tx.type === "allocation" || tx.type === "allocation_release") continue;
    const choice =
      tx.type === "refund" ? refundCategory(tx, byId) : tx.type === "transfer" ? null : tx;
    const resolved = choice ? resolveCategoryChoice(choice, context.categories) : null;
    const key = resolved?.categoryId ?? choice?.categoryId ?? UNCATEGORIZED;
    if (tx.type !== "income" && tx.type !== "transfer" && hidden.has(key)) continue;
    const at = occurredAtMs(tx);
    rows.push({
      id: tx.id,
      date: toLocalDate(at, context.timeZone),
      time: toLocalTime(at, context.timeZone),
      type: tx.type,
      description: tx.description || tx.merchant || "",
      category:
        tx.type === "transfer"
          ? ""
          : ((resolved ? categoryLabel(resolved, context.categories) : null) ?? UNASSIGNED),
      wallet:
        tx.type === "transfer"
          ? `${wallet(tx.fromAccountId)} → ${wallet(tx.toAccountId)}`
          : wallet(tx.accountId),
      amountPaise: tx.amountPaise,
      signedPaise:
        tx.type === "transfer" ? 0 : tx.type === "expense" ? -tx.amountPaise : tx.amountPaise,
      note: context.includeNotes ? tx.note : null,
    });
  }
  return rows.sort((a, b) =>
    a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0,
  );
}

export interface ReportInput {
  accounts: readonly Account[];
  ledger: readonly Transaction[];
  /** Opening and closing balances from `wallet_balances`; see `summarizePeriod`. */
  balances?: LedgerBalances;
  categories: readonly Category[];
  period: Period;
  periodLabel: string;
  /** The window to compare with, and how it reads. Null when there isn't a fair one. */
  comparison: { current: Period; previous: Period; label: string } | null;
  now: Instant;
  settings: TimeSettings;
  currency: CurrencyCode;
  options: ReportOptions;
}

export function buildReport(input: ReportInput): ParentReport {
  const { accounts, ledger, period, now, settings, options } = input;
  const tz = settings.timeZone;
  const hidden = new Set(options.hiddenCategoryIds);
  const categoriesById = new Map(input.categories.map((c) => [c.id, c]));
  const accountsById = new Map(accounts.map((a) => [a.id, a]));

  const summary: PeriodSummary = summarizePeriod(accounts, ledger, period, now, tz, input.balances);
  const breakdown = categoryBreakdown(ledger, period);
  const income = transactionsInPeriod(ledger, period).filter((tx) => tx.type === "income");
  const incomePaise = sumPaise(income.map((tx) => tx.amountPaise));
  const netMovementPaise = subtractPaise(
    addPaise(incomePaise, breakdown.refundsPaise),
    breakdown.grossPaise,
  );
  const { rows, hiddenRow } = categoryRows(breakdown, categoriesById, hidden);

  let comparison: ReportComparison | null = null;
  if (options.compare && input.comparison) {
    const { current, previous, label } = input.comparison;
    const before = categoryBreakdown(ledger, previous);
    const now_ = categoryBreakdown(ledger, current);
    const incomeOf = (p: Period) =>
      sumPaise(
        transactionsInPeriod(ledger, p)
          .filter((tx) => tx.type === "income")
          .map((tx) => tx.amountPaise),
      );
    comparison = {
      label,
      spending: change(now_.netPaise, before.netPaise),
      income: change(incomeOf(current), incomeOf(previous)),
      sparse: now_.expenseCount < FAIR_MINIMUM || before.expenseCount < FAIR_MINIMUM,
    };
  }

  return {
    period,
    periodLabel: input.periodLabel,
    currency: input.currency,
    generatedOn: toLocalDate(now, tz),
    provisional: summary.closing.provisional,
    options,
    openingAsOf: period.startDate,
    closingAsOf: toLocalDate(summary.closing.asOfMs - 1, tz),
    openingPaise: summary.opening.balancePaise,
    closingPaise: summary.closing.balancePaise,
    newlyTrackedPaise: summary.newlyTrackedOpeningPaise,
    incomePaise,
    incomeCount: income.length,
    expensesPaise: breakdown.grossPaise,
    expenseCount: breakdown.expenseCount,
    refundsPaise: breakdown.refundsPaise,
    refundCount: breakdown.categories.reduce((n, c) => n + c.refundCount, 0),
    netSpendingPaise: breakdown.netPaise,
    netMovementPaise,
    beforeTrackingPaise: subtractPaise(netMovementPaise, summary.netMovementPaise),
    transferredPaise: summary.transferredPaise,
    setAsidePaise: summary.allocatedPaise,
    releasedPaise: summary.releasedPaise,
    categories: rows,
    hiddenRow,
    transactions: options.includeTransactions
      ? transactionRows(ledger, period, hidden, {
          accounts: accountsById,
          categories: categoriesById,
          timeZone: tz,
          includeNotes: options.includeNotes,
        })
      : null,
    comparison,
  };
}

/** The sums a reader could do by hand. Each should be zero; the tests hold them to it. */
export function reportDifferences(report: ParentReport) {
  return {
    balance: subtractPaise(
      report.closingPaise,
      subtractPaise(
        addPaise(addPaise(report.openingPaise, report.newlyTrackedPaise), report.netMovementPaise),
        report.beforeTrackingPaise,
      ),
    ),
    spending: subtractPaise(
      report.netSpendingPaise,
      addPaise(sumPaise(report.categories.map((c) => c.netPaise)), report.hiddenRow?.netPaise ?? 0),
    ),
    purchases:
      report.expenseCount -
      (report.categories.reduce((n, c) => n + c.count, 0) + (report.hiddenRow?.count ?? 0)),
  };
}

export const REPORT_TYPE_LABELS = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
} as const;

export const hiddenRowLabel = () => OTHER_CATEGORIES;

/** A lone "No subcategory" row would only repeat the category above it. */
export function reportSubcategories(row: ReportCategoryRow) {
  return row.subcategories.length === 1 && row.subcategories[0]!.key === UNCATEGORIZED
    ? []
    : row.subcategories;
}

/**
 * Spreadsheet-ready: amounts are plain decimals with no symbol or grouping. With details on it's
 * one row per entry; without them, one row per category and subcategory.
 */
export function reportCsv(report: ParentReport): string {
  const { currency } = report;
  if (report.transactions) {
    const withNotes = report.options.includeNotes;
    return csvDocument(
      [
        "Date",
        "Time",
        "Type",
        "Description",
        "Category",
        "Wallet",
        "Currency",
        "Amount",
        "Signed amount",
        ...(withNotes ? ["Note"] : []),
      ],
      report.transactions.map((row) => [
        row.date,
        row.time,
        REPORT_TYPE_LABELS[row.type],
        row.description,
        row.category,
        row.wallet,
        currency,
        { number: paiseToDecimalString(row.amountPaise) },
        { number: paiseToDecimalString(row.signedPaise) },
        ...(withNotes ? [row.note ?? ""] : []),
      ]),
    );
  }
  const rows = report.categories.flatMap((c) => [
    [
      c.label,
      "",
      { number: String(c.count) },
      currency,
      { number: paiseToDecimalString(c.grossPaise) },
      { number: paiseToDecimalString(c.refundsPaise) },
      { number: paiseToDecimalString(c.netPaise) },
    ],
    ...c.subcategories.map((s) => [
      c.label,
      s.label,
      { number: String(s.count) },
      currency,
      { number: paiseToDecimalString(s.grossPaise) },
      { number: paiseToDecimalString(s.refundsPaise) },
      { number: paiseToDecimalString(s.netPaise) },
    ]),
  ]);
  if (report.hiddenRow) {
    rows.push([
      OTHER_CATEGORIES,
      "",
      { number: String(report.hiddenRow.count) },
      currency,
      "",
      "",
      { number: paiseToDecimalString(report.hiddenRow.netPaise) },
    ]);
  }
  return csvDocument(
    ["Category", "Subcategory", "Purchases", "Currency", "Spent", "Refunds", "Net"],
    rows,
  );
}

/** A plain summary to paste into a message. Figures only; nothing is sent from here. */
export function reportText(
  report: ParentReport,
  money: (paise: Paise) => string,
  dateText: (date: LocalDate) => string,
): string {
  const lines = [`PocketPulse report: ${report.periodLabel} (${report.currency})`];
  if (report.openingAsOf) {
    lines.push(`Opening balance on ${dateText(report.openingAsOf)}: ${money(report.openingPaise)}`);
  } else {
    lines.push(`Opening balances: ${money(report.openingPaise)}`);
  }
  if (report.newlyTrackedPaise !== 0) {
    lines.push(`Wallets added during the period: ${money(report.newlyTrackedPaise)}`);
  }
  lines.push(
    `Income: ${money(report.incomePaise)}`,
    `Expenses: ${money(report.expensesPaise)}`,
    `Refunds: ${money(report.refundsPaise)}`,
    `Net movement: ${money(report.netMovementPaise)}`,
  );
  if (report.beforeTrackingPaise !== 0) {
    lines.push(`Entries already in opening balances: ${money(report.beforeTrackingPaise)}`);
  }
  lines.push(
    `${report.provisional ? "Balance so far" : "Closing balance"} on ${dateText(report.closingAsOf)}: ${money(report.closingPaise)}`,
  );
  if (report.categories.length > 0 || report.hiddenRow) {
    lines.push("", "Spending by category:");
    for (const c of report.categories) {
      const share = c.shareBp === null ? "" : ` (${formatBasisPoints(c.shareBp, 0)})`;
      lines.push(`- ${c.label}: ${money(c.netPaise)}${share}`);
    }
    if (report.hiddenRow) {
      lines.push(`- ${OTHER_CATEGORIES}: ${money(report.hiddenRow.netPaise)}`);
    }
  }
  if (report.comparison) {
    lines.push(
      "",
      `Compared with ${report.comparison.label}: spending ${money(report.comparison.spending.previousPaise)}, income ${money(report.comparison.income.previousPaise)}.`,
    );
  }
  lines.push("", "Tracked from entries in PocketPulse, not verified by a bank.");
  return lines.join("\n");
}
