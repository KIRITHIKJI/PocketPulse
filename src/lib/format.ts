/** Display formatting for calendar dates (amounts use `formatMoney` from `@/domain`). */
import {
  type LocalDate,
  type Paise,
  addDays,
  paiseToDecimalString,
  parseInstant,
  parseLocalDate,
  toLocalDate,
  toLocalTime,
  weekdayOf,
} from "@/domain";

/** Paise as an editable amount: 150000 → "1500", 1250 → "12.50", −500 → "-5". */
export function paiseToInput(amount: Paise | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  return paiseToDecimalString(amount).replace(/\.00$/, "");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-20" → "20 Oct 2026". Pure string work, so it never shifts across timezones. */
export function formatLocalDate(date: LocalDate): string {
  const { year, month, day } = parseLocalDate(date);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** History day headings: "Today", "Yesterday", "Sat, 24 Oct", or "Sat, 24 Oct 2025" in another year. */
export function formatDayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const { year, month, day } = parseLocalDate(date);
  const sameYear = year === parseLocalDate(today).year;
  return `${WEEKDAYS[weekdayOf(date)]}, ${day} ${MONTHS[month - 1]}${sameYear ? "" : ` ${year}`}`;
}

/** "16:05" → "4:05 pm". */
export function formatClock(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** An instant as "4:05 pm" in the user's timezone. */
export function formatTimeOf(iso: string, timeZone: string): string {
  return formatClock(toLocalTime(parseInstant(iso), timeZone));
}

/** An instant as "24 Oct 2026, 4:05 pm" in the user's timezone. */
export function formatDateTime(iso: string, timeZone: string): string {
  const ms = parseInstant(iso);
  return `${formatLocalDate(toLocalDate(ms, timeZone))}, ${formatClock(toLocalTime(ms, timeZone))}`;
}

/** Timezones offered in pickers: the platform's IANA list, with the default first. */
export function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  const all = new Set(["Asia/Kolkata", current, ...zones]);
  return [...all];
}
