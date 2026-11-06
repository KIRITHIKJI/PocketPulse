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

function zonedParts(instant: Instant, timeZone: string): ZonedParts {
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
