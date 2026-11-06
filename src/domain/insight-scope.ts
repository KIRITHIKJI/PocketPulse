/** What an Insights figure covers: its history filters, comparable windows and sentence words. */
import { type Paise } from "./money";
import { type PurchaseGrouping } from "./purchases";
import { type LocalDate, addDays, compareLocalDates, daysBetween } from "./time";
import { type Period, previousPeriod, resolvePeriod } from "./periods";

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
