/** Periods (today, week, month, custom, all time) as timezone-aware local-date ranges. */

import {
  type Instant,
  type LocalDate,
  type TimeSettings,
  type Weekday,
  addDays,
  addMonths,
  compareLocalDates,
  daysBetween,
  DEFAULT_TIME_SETTINGS,
  makeLocalDate,
  parseLocalDate,
  startOfLocalDate,
  TimeError,
  toLocalDate,
  weekdayOf,
} from "./time";

// --- Periods ---------------------------------------------------------------

export type PeriodKind =
  | "today"
  | "yesterday"
  | "this_week"
  | "previous_week"
  | "this_month"
  | "previous_month"
  | "custom"
  | "all_time";

export interface Period {
  kind: PeriodKind;
  timeZone: string;
  /** Inclusive start instant, or null when unbounded. */
  startMs: Instant | null;
  /** Exclusive end instant, or null when unbounded. */
  endMs: Instant | null;
  /** First local day included, or null when unbounded. */
  startDate: LocalDate | null;
  /** Last local day included, or null when unbounded. */
  endDate: LocalDate | null;
}

type PeriodRequest =
  { kind: Exclude<PeriodKind, "custom"> } | { kind: "custom"; from: LocalDate; to: LocalDate };

function dayRangePeriod(
  kind: PeriodKind,
  startDate: LocalDate,
  endDate: LocalDate,
  timeZone: string,
): Period {
  if (compareLocalDates(startDate, endDate) > 0) {
    throw new TimeError("A period cannot end before it starts");
  }
  return {
    kind,
    timeZone,
    startDate,
    endDate,
    startMs: startOfLocalDate(startDate, timeZone),
    endMs: startOfLocalDate(addDays(endDate, 1), timeZone),
  };
}

export function startOfWeek(date: LocalDate, weekStartsOn: Weekday = 1): LocalDate {
  const diff = (weekdayOf(date) - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function startOfMonth(date: LocalDate): LocalDate {
  const { year, month } = parseLocalDate(date);
  return makeLocalDate(year, month, 1);
}

export function endOfMonth(date: LocalDate): LocalDate {
  return addDays(addMonths(startOfMonth(date), 1), -1);
}

/** Resolves a named or custom period relative to `now` in the user's timezone. */
export function resolvePeriod(
  request: PeriodRequest,
  now: Instant,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): Period {
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  switch (request.kind) {
    case "today":
      return dayRangePeriod("today", today, today, tz);
    case "yesterday": {
      const y = addDays(today, -1);
      return dayRangePeriod("yesterday", y, y, tz);
    }
    case "this_week": {
      const start = startOfWeek(today, settings.weekStartsOn);
      return dayRangePeriod("this_week", start, addDays(start, 6), tz);
    }
    case "previous_week": {
      const start = addDays(startOfWeek(today, settings.weekStartsOn), -7);
      return dayRangePeriod("previous_week", start, addDays(start, 6), tz);
    }
    case "this_month":
      return dayRangePeriod("this_month", startOfMonth(today), endOfMonth(today), tz);
    case "previous_month": {
      const start = addMonths(startOfMonth(today), -1);
      return dayRangePeriod("previous_month", start, endOfMonth(start), tz);
    }
    case "custom":
      return dayRangePeriod("custom", request.from, request.to, tz);
    case "all_time":
      return {
        kind: "all_time",
        timeZone: tz,
        startMs: null,
        endMs: null,
        startDate: null,
        endDate: null,
      };
  }
}

/**
 * The comparable period immediately before `period`: yesterday for today, the previous
 * week/month for weeks/months, and an equal-length run of days before a custom range.
 * All-time has no previous period.
 */
export function previousPeriod(period: Period): Period | null {
  if (period.startDate === null || period.endDate === null) return null;
  const tz = period.timeZone;
  const { startDate, endDate } = period;
  switch (period.kind) {
    case "this_month":
    case "previous_month": {
      const start = addMonths(startDate, -1);
      return dayRangePeriod("previous_month", start, endOfMonth(start), tz);
    }
    case "this_week":
    case "previous_week":
      return dayRangePeriod("previous_week", addDays(startDate, -7), addDays(endDate, -7), tz);
    default: {
      const length = daysBetween(startDate, endDate) + 1;
      return dayRangePeriod(
        period.kind === "today" ? "yesterday" : "custom",
        addDays(startDate, -length),
        addDays(startDate, -1),
        tz,
      );
    }
  }
}

export function isInPeriod(instant: Instant, period: Period): boolean {
  if (period.startMs !== null && instant < period.startMs) return false;
  if (period.endMs !== null && instant >= period.endMs) return false;
  return true;
}

/** Number of local days in a bounded period. */
export function periodLengthDays(period: Period): number | null {
  if (period.startDate === null || period.endDate === null) return null;
  return daysBetween(period.startDate, period.endDate) + 1;
}

/** Every local day in a bounded period, in order. */
export function eachDay(period: Period): LocalDate[] {
  const length = periodLengthDays(period);
  if (length === null || period.startDate === null) return [];
  return Array.from({ length }, (_, i) => addDays(period.startDate!, i));
}
