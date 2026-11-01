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
  type CategoryChange,
  type PeriodComparison,
  type SpendingEntry,
  type TrendGranularity,
  UNCATEGORIZED,
  amountStats,
  categoryBreakdown,
  comparePeriods,
  spendingEntries,
  spendingTrend,
  transactionsInPeriod,
} from "./aggregation";
import { occurredAtMs } from "./ledger";
import { type Paise, formatBasisPoints, sumPaise } from "./money";
import {
  MIN_REPEATS,
  type PurchaseGroup,
  type PurchaseGrouping,
  type RecurringSignal,
  type SmallPurchaseTotal,
  firstSpendingDate,
  purchaseGroups,
  recurringSignals,
  smallPurchaseTotal,
} from "./purchases";
import type { Transaction } from "./schemas";
import {
  type LocalDate,
  type Period,
  type TimeSettings,
  addDays,
  addMonths,
  compareLocalDates,
  daysBetween,
  previousPeriod,
  resolvePeriod,
  startOfMonth,
  toLocalDate,
} from "./time";

/** The history filters that select exactly the entries behind a figure. */
export interface SpendingScope {
  type: "spending" | "income" | "refund";
  from: LocalDate | null;
  to: LocalDate | null;
  category?: string;
  noSubcategory?: boolean;
  underPaise?: Paise;
  by?: PurchaseGrouping;
  key?: string;
}

export const periodScope = (period: Period): Pick<SpendingScope, "from" | "to"> => ({
  from: period.startDate,
  to: period.endDate,
});

export interface ComparisonWindows {
  /** The period, cut off at today if it's still running. */
  current: Period;
  /** True when today falls before the period's last day. */
  inProgress: boolean;
  /** Earlier comparable windows, nearest first, the same length as `current` when in progress. */
  previous: Period[];
}

/** Null for all-time, or for a period that hasn't started yet. */
export function comparisonWindows(
  period: Period,
  today: LocalDate,
  count: number,
): ComparisonWindows | null {
  if (period.startDate === null || period.endDate === null) return null;
  if (compareLocalDates(period.startDate, today) > 0) return null;
  const settings = { timeZone: period.timeZone, weekStartsOn: 1 } as const;
  const clip = (from: LocalDate, to: LocalDate) =>
    resolvePeriod({ kind: "custom", from, to }, 0, settings);

  const inProgress = compareLocalDates(period.endDate, today) > 0;
  const lastOffset = daysBetween(period.startDate, today);
  const previous: Period[] = [];
  let earlier = previousPeriod(period);
  for (let i = 0; i < count && earlier; i++) {
    const { startDate, endDate } = earlier;
    const lastDay = addDays(startDate!, lastOffset);
    previous.push(
      inProgress && compareLocalDates(lastDay, endDate!) < 0 ? clip(startDate!, lastDay) : earlier,
    );
    earlier = previousPeriod(earlier);
  }
  return { current: inProgress ? clip(period.startDate, today) : period, inProgress, previous };
}

export interface InsightWords {
  /** "this month", "last week", "from 1 Oct to 7 Oct", "so far". */
  period: string;
  /** "the same days last month", "the week before", or null without a previous window. */
  previous: string | null;
  /** "week", "month", "day", "period": what one comparable window is called. */
  unit: string;
  money: (paise: Paise) => string;
  labelOf: (key: string) => string;
}

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const entriesText = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
const lastSegment = (label: string) => label.split(" › ").at(-1)!;

// --- Insight cards ---------------------------------------------------------------------------

export type InsightKind = "repeat" | "change" | "small" | "biggest" | "unassigned";

export interface InsightCard {
  id: string;
  kind: InsightKind;
  text: string;
  paise: Paise;
  scope: SpendingScope;
}

/** "You bought coffee 16 times for ₹25 each: ₹400 this month." */
export function repeatInsightText(group: PurchaseGroup, words: InsightWords): string {
  const { money } = words;
  const name = group.label.toLowerCase();
  const price =
    group.minPaise === group.maxPaise
      ? `for ${money(group.minPaise!)} each`
      : `for about ${money(group.averagePaise!)} each`;
  const refunded =
    group.refundsPaise > 0
      ? `, or ${money(group.netPaise)} after ${money(group.refundsPaise)} in refunds`
      : "";
  return `You bought ${name} ${times(group.count)} ${price}: ${money(group.grossPaise)} ${words.period}${refunded}.`;
}

/** "Food & Drinks increased by ₹450 compared with the previous week, mainly due to snacks." */
export function changeInsightText(
  item: CategoryChange,
  words: InsightWords,
  previous: string,
): string {
  const up = item.deltaPaise > 0;
  const driver = item.mainDriver;
  // "Mainly" has to be true: the subcategory must account for at least half the change.
  const mainly =
    driver &&
    driver.key !== UNCATEGORIZED &&
    Math.abs(driver.deltaPaise) * 2 >= Math.abs(item.deltaPaise)
      ? `, mainly due to ${lastSegment(words.labelOf(driver.key)).toLowerCase()}`
      : "";
  return `${lastSegment(words.labelOf(item.key))} ${up ? "increased" : "decreased"} by ${words.money(Math.abs(item.deltaPaise))} compared with ${previous}${mainly}.`;
}

function buildCards(input: {
  breakdown: CategoryBreakdown;
  comparison: PeriodComparison | null;
  repeats: readonly PurchaseGroup[];
  small: SmallPurchaseTotal;
  changes: readonly CategoryChange[];
  scope: Pick<SpendingScope, "from" | "to">;
  words: InsightWords;
}): InsightCard[] {
  const { breakdown, repeats, small, changes, scope, words } = input;
  const { money } = words;
  const cards: InsightCard[] = [];
  const spending = { type: "spending", ...scope } as const;

  for (const group of repeats.slice(0, 3)) {
    cards.push({
      id: `repeat:${group.key}`,
      kind: "repeat",
      text: repeatInsightText(group, words),
      paise: group.netPaise,
      scope: { ...spending, by: group.by, key: group.key },
    });
  }
  if (words.previous) {
    for (const item of changes.slice(0, 2)) {
      cards.push({
        id: `change:${item.key}`,
        kind: "change",
        text: changeInsightText(item, words, words.previous),
        paise: item.currentPaise,
        scope: { ...spending, category: item.key },
      });
    }
  }
  if (small.count >= MIN_REPEATS && small.shareBp !== null) {
    cards.push({
      id: "small",
      kind: "small",
      text: `${plural(small.count, "purchase")} under ${money(small.thresholdPaise)} added up to ${money(small.netPaise)} ${words.period}, ${formatBasisPoints(small.shareBp, 0)} of your spending.`,
      paise: small.netPaise,
      scope: { ...spending, underPaise: small.thresholdPaise },
    });
  }
  const [top, second] = breakdown.categories;
  if (top && second && breakdown.expenseCount >= MIN_REPEATS && top.netPaise > 0) {
    const share = top.shareBp === null ? "" : `, ${formatBasisPoints(top.shareBp, 0)} of spending`;
    cards.push({
      id: "biggest",
      kind: "biggest",
      text: `${lastSegment(words.labelOf(top.key))} was your biggest category ${words.period}: ${money(top.netPaise)}${share}.`,
      paise: top.netPaise,
      scope: { ...spending, category: top.key },
    });
  }
  const unassigned = breakdown.categories.find((c) => c.key === UNCATEGORIZED);
  if (unassigned) {
    const entries = unassigned.count + unassigned.refundCount;
    cards.push({
      id: "unassigned",
      kind: "unassigned",
      text: `${entriesText(entries)} worth ${money(unassigned.netPaise)} ${entries === 1 ? "has" : "have"} no category yet.`,
      paise: unassigned.netPaise,
      scope: { ...spending, category: UNCATEGORIZED },
    });
  }
  return cards;
}

// --- Unusual changes -------------------------------------------------------------------------

export interface UnusualChange {
  key: string;
  direction: "higher" | "lower";
  currentPaise: Paise;
  typicalPaise: Paise;
  text: string;
  /** Plain-language "how we detected this". */
  how: string;
  scope: SpendingScope;
}

const BASELINE_WINDOWS = 4;
const MIN_BASELINE_WINDOWS = 3;

/** Earlier windows fit to judge "usual": from before tracking began, ₹0 would be meaningless. */
function usableBaseline(ledger: readonly Transaction[], windows: ComparisonWindows): Period[] {
  const first = firstSpendingDate(ledger, windows.current.timeZone);
  if (first === null) return [];
  return windows.previous
    .filter((w) => compareLocalDates(w.startDate!, first) >= 0)
    .slice(0, BASELINE_WINDOWS);
}

/**
 * A category is unusual when it is at least 1.5× or at most half the median of up to four
 * earlier windows, and the gap is at least the user's small-purchase amount, so that ₹3 against
 * ₹1 is never reported.
 */
export function unusualChanges(
  ledger: readonly Transaction[],
  windows: ComparisonWindows,
  thresholdPaise: Paise,
  words: InsightWords,
): UnusualChange[] {
  const baseline = usableBaseline(ledger, windows);
  if (baseline.length < MIN_BASELINE_WINDOWS) return [];

  const current = categoryBreakdown(ledger, windows.current);
  const before = baseline.map((w) => categoryBreakdown(ledger, w));
  const keys = new Set([
    ...current.categories.map((c) => c.key),
    ...before.flatMap((b) => b.categories.map((c) => c.key)),
  ]);
  const netIn = (b: CategoryBreakdown, key: string) =>
    b.categories.find((c) => c.key === key)?.netPaise ?? 0;

  const found: UnusualChange[] = [];
  for (const key of keys) {
    const now = netIn(current, key);
    const nets = before.map((b) => netIn(b, key));
    const typical = amountStats(nets).medianPaise ?? 0;
    if (typical <= 0) continue;
    const higher = now * 2 >= typical * 3 && now - typical >= thresholdPaise;
    const lower = now * 2 <= typical && typical - now >= thresholdPaise;
    if (!higher && !lower) continue;

    const { money, labelOf, unit, period } = words;
    const name = lastSegment(labelOf(key));
    const list = nets.map(money).join(", ");
    found.push({
      key,
      direction: higher ? "higher" : "lower",
      currentPaise: now,
      typicalPaise: typical,
      text: `${name} is ${higher ? "higher" : "lower"} than usual ${period}: ${money(now)}, against a typical ${money(typical)}.`,
      how: `We compared it with your previous ${baseline.length} ${unit}s (${list}). The median is ${money(typical)}. We point out a category when it reaches 1.5× the median or falls to half of it, and the gap is at least your small-purchase amount of ${money(thresholdPaise)}.`,
      scope: {
        type: "spending",
        category: key,
        ...periodScope(now === 0 ? baseline[0]! : windows.current),
      },
    });
  }
  return found.sort(
    (a, b) =>
      Math.abs(b.currentPaise - b.typicalPaise) - Math.abs(a.currentPaise - a.typicalPaise) ||
      (a.key < b.key ? -1 : 1),
  );
}

// --- Trends ----------------------------------------------------------------------------------

export interface TrendPoint {
  startDate: LocalDate;
  /** The bucket's days inside the period: a week can begin before the period does. */
  from: LocalDate;
  to: LocalDate;
  netPaise: Paise;
  /** Height of the bar: never below zero (see `spendingDisplay`). */
  chartPaise: Paise;
  count: number;
  transactionIds: string[];
}

export interface TrendView {
  granularity: TrendGranularity | null;
  /** Granularities that make sense for this period: more than one bucket, and not too many. */
  options: TrendGranularity[];
  points: TrendPoint[];
  /** Why no chart is shown; null when there is one. */
  sparseReason: string | null;
  /** Buckets where refunds exceeded purchases, so the bar is drawn at zero. */
  hasNetRefundBucket: boolean;
}

const MAX_BUCKETS = 120;
const COMFORTABLE_BUCKETS = 31;
const MIN_ACTIVE_BUCKETS = 2;

function bucketEnd(start: LocalDate, granularity: TrendGranularity): LocalDate {
  if (granularity === "day") return start;
  if (granularity === "week") return addDays(start, 6);
  return addDays(addMonths(startOfMonth(start), 1), -1);
}

/** Spending per day/week/month. Reaches zero gaps too, and adds up to the period's total. */
export function trendView(
  ledger: readonly Transaction[],
  period: Period,
  today: LocalDate,
  settings: TimeSettings,
  requested: TrendGranularity | null,
  only: (entry: SpendingEntry) => boolean = () => true,
): TrendView {
  const entries = spendingEntries(ledger, period).filter(only);
  const empty = { granularity: null, options: [], points: [], hasNetRefundBucket: false };
  if (entries.length === 0) return { ...empty, sparseReason: "Nothing recorded in this period." };

  const dates = entries.map((e) => toLocalDate(occurredAtMs(e.tx), period.timeZone)).sort();
  const newest = dates.at(-1)!;
  const lastDate = compareLocalDates(newest, today) > 0 ? newest : today;
  const bounded =
    period.startDate === null || period.endDate === null
      ? resolvePeriod({ kind: "custom", from: dates[0]!, to: lastDate }, 0, settings)
      : period;

  const bucketsFor = (granularity: TrendGranularity) =>
    spendingTrend(ledger, bounded, granularity, settings, only).filter(
      (b) => compareLocalDates(b.startDate, lastDate) <= 0 || b.transactionIds.length > 0,
    );
  const all = (["day", "week", "month"] as const).map((g) => [g, bucketsFor(g)] as const);
  const usable = all.filter(([, b]) => b.length >= 2 && b.length <= MAX_BUCKETS);
  const options = usable.map(([g]) => g);
  const picked =
    usable.find(([g]) => g === requested) ??
    usable.find(([, b]) => b.length <= COMFORTABLE_BUCKETS) ??
    usable.at(-1);
  if (!picked) {
    return { ...empty, sparseReason: "A trend needs more than one day. Pick a longer period." };
  }

  const [granularity, buckets] = picked;
  const clampDate = (date: LocalDate, low: LocalDate, high: LocalDate) =>
    compareLocalDates(date, low) < 0 ? low : compareLocalDates(date, high) > 0 ? high : date;
  const points = buckets.map((b): TrendPoint => ({
    startDate: b.startDate,
    from: clampDate(b.startDate, bounded.startDate!, bounded.endDate!),
    to: clampDate(bucketEnd(b.startDate, granularity), bounded.startDate!, bounded.endDate!),
    netPaise: b.netPaise,
    chartPaise: Math.max(0, b.netPaise),
    count: b.count,
    transactionIds: b.transactionIds,
  }));
  const active = points.filter((p) => p.transactionIds.length > 0).length;
  return {
    granularity,
    options,
    points,
    sparseReason:
      active < MIN_ACTIVE_BUCKETS
        ? `Not enough data for a trend yet: all of this is from one ${granularity}.`
        : null,
    hasNetRefundBucket: points.some((p) => p.netPaise < 0),
  };
}

// --- The whole screen ------------------------------------------------------------------------

export type InsightsStatus = "no_spending" | "empty_period" | "ready";

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

export interface InsightsInput {
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
