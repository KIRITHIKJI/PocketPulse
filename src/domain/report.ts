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
  transactionsInPeriod,
} from "./aggregation";
import { change, type Change } from "./period-comparison";
import { type LedgerBalances, type PeriodSummary, summarizePeriod } from "./balances";
import { categoryLabel, resolveCategoryChoice } from "./category-tree";
import { indexById, occurredAtMs, refundCategory } from "./ledger";
import { type Paise, addPaise, subtractPaise, sumPaise } from "./money";
import type { CurrencyCode } from "./money";
import type { Account, Category, Transaction } from "./schemas";
import { type Instant, type LocalDate, type TimeSettings, toLocalDate, toLocalTime } from "./time";
import { type Period } from "./periods";

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
export const OTHER_CATEGORIES = "Other categories";

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

interface ReportInput {
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
