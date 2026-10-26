/**
 * Calendar + timezone rules shared by every screen, budget and report.
 *
 * - An instant is epoch milliseconds (UTC). A `LocalDate` is a calendar day "YYYY-MM-DD" in the
 *   user's timezone (default Asia/Kolkata).
 * - Every period is half-open: [startMs, endMs). A transaction at exactly local midnight belongs
 *   to the day that starts at that midnight, never to the previous one.
 * - `null` bounds mean unbounded (used by all-time).
 * - Weeks start on Monday by default (configurable).
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export type Instant = number;
export type LocalDate = string;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday … 6 = Saturday

export interface TimeSettings {
  timeZone: string;
  weekStartsOn: Weekday;
}

export const DEFAULT_TIME_SETTINGS: TimeSettings = { timeZone: DEFAULT_TIMEZONE, weekStartsOn: 1 };

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export class TimeError extends Error {
  override name = "TimeError";
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    if (!isValidTimeZone(timeZone)) throw new TimeError(`Unknown timezone: ${timeZone}`);
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedParts(instant: Instant, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") out[part.type] = Number(part.value);
  }
  return {
    year: out.year!,
    month: out.month!,
    day: out.day!,
    hour: out.hour!,
    minute: out.minute!,
    second: out.second!,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in ms (IST → +19 800 000). */
function offsetMs(instant: Instant, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - (instant - (((instant % 1000) + 1000) % 1000));
}

// --- LocalDate calendar arithmetic (pure, timezone-free) -------------------

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const m = LOCAL_DATE_PATTERN.exec(date);
  if (!m) throw new TimeError(`Invalid date: ${date}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new TimeError(`Invalid date: ${date}`);
  }
  return { year, month, day };
}

export function isLocalDate(value: string): boolean {
  try {
    parseLocalDate(value);
    return true;
  } catch {
    return false;
  }
}

function fromUtcDate(d: Date): LocalDate {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function makeLocalDate(year: number, month: number, day: number): LocalDate {
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  return fromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Adds calendar months, clamping the day (31 Jan + 1 month → 28/29 Feb). */
export function addMonths(date: LocalDate, months: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return makeLocalDate(
    firstOfTarget.getUTCFullYear(),
    firstOfTarget.getUTCMonth() + 1,
    Math.min(day, lastDay),
  );
}

/** Whole calendar days from `from` to `to` (to − from); negative if `to` is earlier. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  return (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS;
}

export function weekdayOf(date: LocalDate): Weekday {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

export function compareLocalDates(a: LocalDate, b: LocalDate): number {
  return a < b ? -1 : a > b ? 1 : 0; // ISO dates sort lexicographically
}

// --- Instant <-> LocalDate -------------------------------------------------

export function toLocalDate(instant: Instant, timeZone = DEFAULT_TIMEZONE): LocalDate {
  const p = zonedParts(instant, timeZone);
  return makeLocalDate(p.year, p.month, p.day);
}

/** The instant at which `date` begins (local midnight) in `timeZone`. */
export function startOfLocalDate(date: LocalDate, timeZone = DEFAULT_TIMEZONE): Instant {
  const { year, month, day } = parseLocalDate(date);
  const guess = Date.UTC(year, month - 1, day);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM" on a 24-hour clock. */
export function isLocalTime(value: string): boolean {
  return LOCAL_TIME_PATTERN.test(value);
}

/**
 * The instant of a wall-clock time ("HH:MM") on `date` in `timeZone`. Same two-pass offset
 * correction as `startOfLocalDate`, so it stays right across DST changes.
 */
export function instantFromLocalDateTime(
  date: LocalDate,
  time: string,
  timeZone = DEFAULT_TIMEZONE,
): Instant {
  const m = LOCAL_TIME_PATTERN.exec(time);
  if (!m) throw new TimeError(`Invalid time: ${time}`);
  const { year, month, day } = parseLocalDate(date);
  const guess = Date.UTC(year, month - 1, day, Number(m[1]), Number(m[2]));
  const first = guess - offsetMs(guess, timeZone);
  return guess - offsetMs(first, timeZone);
}

/** Wall-clock "HH:MM" of an instant in `timeZone`. */
export function toLocalTime(instant: Instant, timeZone = DEFAULT_TIMEZONE): string {
  const p = zonedParts(instant, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function parseInstant(iso: string): Instant {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new TimeError(`Invalid timestamp: ${iso}`);
  return ms;
}

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

export type PeriodRequest =
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
