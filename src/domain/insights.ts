/**
 * The Insights model: one call builds every figure and sentence for a period from the ledger, so
 * screens only render it. Nothing here is a demo value, and a sentence exists only if the data
 * supports it. Sparse data yields `null` or an explicit reason, never a ₹0 average or a NaN.
 *
 * Each figure carries a `SpendingScope`: the history filters that select exactly the entries
 * behind it. `src/lib/insights-view.ts` turns one into a link, and the tests check that history
 * returns the same entries and the same total.
 *
 * A period still in progress is compared fairly: the first 7 days of this month against the first
 * 7 days of last month, never against the whole of it.
 */
import {
  type CategoryBreakdown,
  amountStats,
  categoryBreakdown,
  spendingEntries,
  transactionsInPeriod,
} from "./aggregation";
import { type CategoryChange, type PeriodComparison, comparePeriods } from "./period-comparison";
import { type Paise, sumPaise } from "./money";
import {
  MIN_REPEATS,
  type PurchaseGroup,
  type SmallPurchaseTotal,
  purchaseGroups,
  smallPurchaseTotal,
} from "./purchases";
import { type RecurringSignal, firstSpendingDate, recurringSignals } from "./recurring-signals";
import type { Transaction } from "./schemas";
import { type LocalDate, type TimeSettings } from "./time";
import { type Period } from "./periods";
import {
  type InsightCard,
  type UnusualChange,
  BASELINE_WINDOWS,
  buildCards,
  MIN_BASELINE_WINDOWS,
  unusualChanges,
  usableBaseline,
} from "./insight-cards";
import { type InsightWords, comparisonWindows, periodScope } from "./insight-scope";

export {
  type InsightWords,
  type SpendingScope,
  comparisonWindows,
  periodScope,
} from "./insight-scope";
export { repeatInsightText } from "./insight-cards";
export { trendView } from "./insight-trends";

// --- The whole screen ------------------------------------------------------------------------

type InsightsStatus = "no_spending" | "empty_period" | "ready";

export interface InsightsModel {
  status: InsightsStatus;
  breakdown: CategoryBreakdown;
  income: { paise: Paise; count: number };
  /** Null until there are enough purchases for the figure to mean anything. */
  averagePaise: Paise | null;
  medianPaise: Paise | null;
  /** The figure's own reason when `comparison` can't be shown. */
  comparison: PeriodComparison | null;
  comparisonNote: string | null;
  previousWindow: Period | null;
  /** Category changes worth listing, biggest first. Empty unless `comparison.comparable`. */
  changes: CategoryChange[];
  small: SmallPurchaseTotal;
  frequent: PurchaseGroup[];
  merchants: PurchaseGroup[];
  cards: InsightCard[];
  unusual: UnusualChange[];
  unusualNote: string | null;
  recurring: RecurringSignal[];
}

interface InsightsInput {
  ledger: readonly Transaction[];
  period: Period;
  today: LocalDate;
  settings: TimeSettings;
  thresholdPaise: Paise;
  words: InsightWords;
}

const MIN_FOR_AVERAGE = 2;
const MIN_FOR_MEDIAN = 3;
const MIN_FREQUENT = 2;
const TOP_FREQUENT = 5;
const MIN_PURCHASES_FOR_CHANGE = 2;

export function buildInsights({
  ledger,
  period,
  today,
  settings,
  thresholdPaise,
  words,
}: InsightsInput): InsightsModel {
  const entries = spendingEntries(ledger, period);
  const breakdown = categoryBreakdown(ledger, period);
  const purchases = entries.filter((e) => e.tx.type === "expense").map((e) => e.signedPaise);
  const stats = amountStats(purchases);
  const income = transactionsInPeriod(ledger, period).filter((tx) => tx.type === "income");

  const windows = comparisonWindows(period, today, BASELINE_WINDOWS + 1);
  const previousWindow = windows?.previous[0] ?? null;
  const comparison =
    windows && previousWindow
      ? comparePeriods(
          categoryBreakdown(ledger, windows.current),
          categoryBreakdown(ledger, previousWindow),
        )
      : null;
  const comparisonNote = !windows
    ? period.startDate === null
      ? "All time has no earlier period to compare with."
      : "This period hasn’t started yet."
    : (comparison?.reason ?? null);

  const countIn = (b: CategoryBreakdown, key: string) =>
    b.categories.find((c) => c.key === key)?.count ?? 0;
  const before =
    comparison?.comparable && previousWindow ? categoryBreakdown(ledger, previousWindow) : null;
  const changes =
    comparison?.comparable && before
      ? comparison.categories.filter(
          (c) =>
            c.deltaPaise !== 0 &&
            countIn(breakdown, c.key) + countIn(before, c.key) >= MIN_PURCHASES_FOR_CHANGE,
        )
      : [];

  const labelOf = words.labelOf;
  const frequentAll = purchaseGroups(ledger, period, { by: "description", labelOf });
  const small = smallPurchaseTotal(ledger, period, thresholdPaise);
  const scope = periodScope(period);

  const unusual = windows ? unusualChanges(ledger, windows, thresholdPaise, words) : [];
  const unusualNote = !windows
    ? "Pick a bounded period, such as a week or month, to check for unusual changes."
    : usableBaseline(ledger, windows).length < MIN_BASELINE_WINDOWS
      ? `Not enough history yet. We need at least ${MIN_BASELINE_WINDOWS} earlier ${words.unit}s to judge what’s usual.`
      : unusual.length === 0
        ? "Nothing unusual: every category is close to its usual level."
        : null;

  return {
    status:
      entries.length > 0
        ? "ready"
        : firstSpendingDate(ledger, period.timeZone)
          ? "empty_period"
          : "no_spending",
    breakdown,
    income: { paise: sumPaise(income.map((tx) => tx.amountPaise)), count: income.length },
    averagePaise: stats.count >= MIN_FOR_AVERAGE ? stats.averagePaise : null,
    medianPaise: stats.count >= MIN_FOR_MEDIAN ? stats.medianPaise : null,
    comparison,
    comparisonNote,
    previousWindow,
    changes,
    small,
    frequent: frequentAll.filter((g) => g.count >= MIN_FREQUENT).slice(0, TOP_FREQUENT),
    merchants: purchaseGroups(ledger, period, { by: "merchant", labelOf })
      .filter((g) => g.count >= MIN_FREQUENT)
      .slice(0, TOP_FREQUENT),
    cards: buildCards({
      breakdown,
      comparison,
      repeats: frequentAll.filter((g) => g.count >= MIN_REPEATS),
      small,
      changes,
      scope,
      words,
    }),
    unusual,
    unusualNote,
    recurring: recurringSignals(ledger, today, settings),
  };
}
