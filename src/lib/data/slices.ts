/**
 * Helpers for reading part of the ledger instead of all of it. Pure, so they're unit-tested.
 *
 * A screen reads the rows from the earliest instant any of its periods can start, plus small
 * all-time reads for the figures that span all history (goal money, recurring links). Every
 * figure is still worked out by `@/domain`, which filters to the exact periods itself.
 */
import {
  type Instant,
  type Period,
  type TimeSettings,
  type Transaction,
  type Weekday,
  occurredAtMs,
} from "@/domain";

const HOUR_MS = 3_600_000;
/** The westernmost zone (UTC−12): no place on Earth is on an earlier calendar date. */
const WESTMOST_ZONE = "Etc/GMT+12";
const WEEK_STARTS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/**
 * An instant no later than the start of any period `periodsFor` gives, whatever the user's time
 * zone and week start. A page can then start its ledger read alongside the profile read instead
 * of waiting for it. Null when a period has no start (all time): everything is needed.
 *
 * Calendar periods only move later as "today" does, so the dates come from the westernmost
 * zone, trying every week start. Local midnight is at most 14 hours before UTC midnight
 * (UTC+14), and one more day covers daylight-saving shifts. In the hours around a period's
 * boundary the westernmost zone can still be in the period before, which the read then includes.
 * The extra rows are filtered out by the domain functions, which take the real periods.
 */
export function startForAnyZone(
  periodsFor: (settings: TimeSettings) => readonly (Period | null)[],
): Instant | null {
  let earliest: string | null = null;
  for (const weekStartsOn of WEEK_STARTS) {
    for (const period of periodsFor({ timeZone: WESTMOST_ZONE, weekStartsOn })) {
      if (!period) continue;
      if (period.startDate === null) return null;
      if (earliest === null || period.startDate < earliest) earliest = period.startDate;
    }
  }
  if (earliest === null) return null;
  return Date.parse(`${earliest}T00:00:00Z`) - 14 * HOUR_MS - 24 * HOUR_MS;
}

/** An instant as the ISO text the ledger loaders take (and cache by). */
export function isoInstant(ms: Instant): string {
  return new Date(ms).toISOString();
}

/** The earliest of several starts; null (everything) wins. */
export function earliestStart(...starts: (Instant | null)[]): Instant | null {
  let earliest = Number.POSITIVE_INFINITY;
  for (const start of starts) {
    if (start === null) return null;
    earliest = Math.min(earliest, start);
  }
  return earliest;
}

/** Ledger order, as the database reads it: newest first, then by id. */
function ledgerOrder(a: Transaction, b: Transaction): number {
  return occurredAtMs(b) - occurredAtMs(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Several reads of the ledger as one list, each row once, in ledger order. */
export function mergeLedger(...parts: readonly (readonly Transaction[])[]): Transaction[] {
  const byId = new Map<string, Transaction>();
  for (const part of parts) for (const tx of part) byId.set(tx.id, tx);
  return [...byId.values()].sort(ledgerOrder);
}

/**
 * Purchases that refunds in `ledger` point at but that aren't in it (they're older than the
 * rows read). A refund's category, and whether it counts as small, come from its purchase.
 */
export function missingRefundOriginals(ledger: readonly Transaction[]): string[] {
  const ids = new Set(ledger.map((tx) => tx.id));
  const missing = new Set<string>();
  for (const tx of ledger) {
    if (tx.type === "refund" && !ids.has(tx.refundOfId)) missing.add(tx.refundOfId);
  }
  return [...missing].sort();
}
