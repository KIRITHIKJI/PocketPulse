/** Spending per day, week or month for the Insights trend chart. */
import { type SpendingEntry, spendingEntries } from "./aggregation";
import { type TrendGranularity, spendingTrend } from "./spending-trend";
import { occurredAtMs } from "./ledger";
import { type Paise } from "./money";
import type { Transaction } from "./schemas";
import {
  type LocalDate,
  type TimeSettings,
  addDays,
  addMonths,
  compareLocalDates,
  toLocalDate,
} from "./time";
import { type Period, resolvePeriod, startOfMonth } from "./periods";

// --- Trends ----------------------------------------------------------------------------------

interface TrendPoint {
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

interface TrendView {
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
