/** Purchases that look recurring (similar amount at a steady interval), and the first spending date. */
import { indexById, isActive, occurredAtMs } from "./ledger";
import { type Paise } from "./money";
import type { Transaction } from "./schemas";
import { type LocalDate, type TimeSettings, daysBetween, toLocalDate } from "./time";
import { resolvePeriod } from "./periods";
import { type PurchaseGrouping, purchaseGroups } from "./purchases";

// --- Recurring signals ----------------------------------------------------------------------

export interface RecurringSignal {
  by: PurchaseGrouping;
  key: string;
  label: string;
  cadence: "weekly" | "monthly" | "regular";
  /** Median gap between purchases. */
  everyDays: number;
  count: number;
  typicalPaise: Paise;
  netPaise: Paise;
  lastDate: LocalDate;
  transactionIds: string[];
}

const MIN_SIGNAL_DATES = 3;
const MIN_SIGNAL_GAP_DAYS = 6; // anything tighter is a habit, which the leak view already covers

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/**
 * Purchases that repeat on a steady rhythm for a steady price, across all history. A signal, not
 * a fact: it needs three dates with even gaps, prices within 25 % of each other, and must not
 * have gone quiet for more than two gaps.
 */
export function recurringSignals(
  ledger: readonly Transaction[],
  today: LocalDate,
  settings: TimeSettings,
): RecurringSignal[] {
  const allTime = resolvePeriod({ kind: "all_time" }, 0, settings);
  const byId = indexById(ledger);
  const signals: RecurringSignal[] = [];
  const seen = new Set<string>();

  for (const by of ["description", "merchant"] as const) {
    for (const group of purchaseGroups(ledger, allTime, { by })) {
      if (group.transactionIds.some((id) => seen.has(id))) continue;
      const purchases = group.transactionIds
        .map((id) => byId.get(id)!)
        .filter((tx) => tx.type === "expense");
      const dates = [
        ...new Set(purchases.map((tx) => toLocalDate(occurredAtMs(tx), settings.timeZone))),
      ].sort();
      if (dates.length < MIN_SIGNAL_DATES) continue;

      const gaps = dates.slice(1).map((date, i) => daysBetween(dates[i]!, date));
      const everyDays = median(gaps);
      const slack = Math.max(2, Math.ceil(everyDays * 0.15));
      const steady = gaps.every((gap) => Math.abs(gap - everyDays) <= slack);
      const lastDate = dates.at(-1)!;
      const quiet = daysBetween(lastDate, today) > everyDays * 2;
      const stablePrice = group.maxPaise! * 4 <= group.minPaise! * 5;
      if (everyDays < MIN_SIGNAL_GAP_DAYS || !steady || quiet || !stablePrice) continue;

      group.transactionIds.forEach((id) => seen.add(id));
      signals.push({
        by,
        key: group.key,
        label: group.label,
        cadence:
          everyDays >= 6 && everyDays <= 8
            ? "weekly"
            : everyDays >= 27 && everyDays <= 33
              ? "monthly"
              : "regular",
        everyDays,
        count: group.count,
        typicalPaise: group.medianPaise!,
        netPaise: group.netPaise,
        lastDate,
        transactionIds: group.transactionIds,
      });
    }
  }
  return signals.sort((a, b) => b.netPaise - a.netPaise || (a.key < b.key ? -1 : 1));
}

/** The earliest local date with an active expense or refund, or null. */
export function firstSpendingDate(
  ledger: readonly Transaction[],
  timeZone: string,
): LocalDate | null {
  let first: number | null = null;
  for (const tx of ledger) {
    if (!isActive(tx) || (tx.type !== "expense" && tx.type !== "refund")) continue;
    const at = occurredAtMs(tx);
    if (first === null || at < first) first = at;
  }
  return first === null ? null : toLocalDate(first, timeZone);
}
