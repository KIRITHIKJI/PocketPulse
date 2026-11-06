/** Net spending per day, week or month across a period. */
import { addPaise, type Paise } from "./money";
import { occurredAtMs } from "./ledger";
import type { Transaction } from "./schemas";
import {
  DEFAULT_TIME_SETTINGS,
  type LocalDate,
  type TimeSettings,
  addMonths,
  toLocalDate,
} from "./time";
import { type Period, eachDay, startOfMonth, startOfWeek } from "./periods";
import { type SpendingEntry, spendingEntries } from "./aggregation";

// --- Trends -------------------------------------------------------------------------------

export type TrendGranularity = "day" | "week" | "month";

interface TrendBucket {
  /** First local day of the bucket. */
  startDate: LocalDate;
  netPaise: Paise;
  count: number;
  transactionIds: string[];
}

/**
 * Net spending per day/week/month across a bounded period, including empty buckets. `only`
 * narrows it to some entries (one category's trend). A week or month bucket can start before the
 * period does, but holds only the period's entries.
 */
export function spendingTrend(
  ledger: readonly Transaction[],
  period: Period,
  granularity: TrendGranularity,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  only: (entry: SpendingEntry) => boolean = () => true,
): TrendBucket[] {
  const keyOf = (date: LocalDate) =>
    granularity === "day"
      ? date
      : granularity === "week"
        ? startOfWeek(date, settings.weekStartsOn)
        : startOfMonth(date);

  const buckets = new Map<LocalDate, TrendBucket>();
  for (const day of eachDay(period)) {
    const key = keyOf(day);
    if (!buckets.has(key))
      buckets.set(key, { startDate: key, netPaise: 0, count: 0, transactionIds: [] });
  }
  for (const entry of spendingEntries(ledger, period).filter(only)) {
    const key = keyOf(toLocalDate(occurredAtMs(entry.tx), period.timeZone));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { startDate: key, netPaise: 0, count: 0, transactionIds: [] };
      buckets.set(key, bucket);
    }
    bucket.netPaise = addPaise(bucket.netPaise, entry.signedPaise);
    if (entry.tx.type === "expense") bucket.count++;
    bucket.transactionIds.push(entry.tx.id);
  }
  return [...buckets.values()].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/** Month starts covering `months` complete months before the month containing `date`. */
export function previousMonthStarts(date: LocalDate, months: number): LocalDate[] {
  const thisMonth = startOfMonth(date);
  return Array.from({ length: months }, (_, i) => addMonths(thisMonth, -(i + 1)));
}
