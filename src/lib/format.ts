/** Display formatting for calendar dates (amounts use `formatMoney` from `@/domain`). */
import { type LocalDate, type Paise, paiseToDecimalString, parseLocalDate } from "@/domain";

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
