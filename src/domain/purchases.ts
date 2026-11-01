/**
 * Repeated purchases: groups by description, merchant, quick-add tile or category, the small-
 * purchase total, Money Leak groups, what-ifs and recurring signals.
 *
 * Every group follows the refund convention: a refund joins the group of the purchase it refunds
 * and reduces that group's net total in the period the refund happened. Keys are worked out per
 * transaction by `purchaseGroupKey`, so a history filter can select exactly the same entries.
 *
 * "Similar description" means the same words after dropping filler, digits, word order and a
 * plural s. There is deliberately no spelling tolerance: "coffee" and "toffee" are one letter
 * apart, and merging them would state something false about the user's money.
 */
import {
  type Change,
  type SpendingEntry,
  UNCATEGORIZED,
  amountStats,
  change,
  netSpending,
  spendingEntries,
} from "./aggregation";
import { normalizeText, significantTokens } from "./categorize";
import { indexById, isActive, occurredAtMs, refundCategory } from "./ledger";
import { type Paise, multiplyPaise, ratioBasisPoints, subtractPaise, sumPaise } from "./money";
import type { ExpenseTransaction, RefundTransaction, Transaction } from "./schemas";
import {
  type LocalDate,
  type Period,
  type TimeSettings,
  daysBetween,
  resolvePeriod,
  toLocalDate,
} from "./time";

export const PURCHASE_GROUPINGS = ["description", "merchant", "tile", "category"] as const;
export type PurchaseGrouping = (typeof PURCHASE_GROUPINGS)[number];

/** A purchase has to happen this many times in a period to count as repeated. */
export const MIN_REPEATS = 3;

type SpendingTx = ExpenseTransaction | RefundTransaction;

const singular = (word: string) =>
  word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;

/** "Coffees!" and "coffee" → "coffee"; "chai masala" and "Masala chai ₹15" → "chai masala". */
export function purchaseTextKey(text: string | null | undefined): string | null {
  const words = significantTokens(text).map(singular);
  if (words.length > 0) return [...new Set(words)].sort().join(" ");
  return normalizeText(text) || null;
}

function purchaseOf(
  tx: SpendingTx,
  byId: ReadonlyMap<string, Transaction>,
): ExpenseTransaction | null {
  if (tx.type === "expense") return tx;
  const original = byId.get(tx.refundOfId);
  return original?.type === "expense" ? original : null;
}

/**
 * The group a spending entry belongs to, or null if it has nothing to group by. An entry knows
 * which tile made it, so renaming the tile keeps its group. Older quick-add entries that couldn't
 * be linked to one tile fall back to the label saved as their description.
 */
export function purchaseGroupKey(
  tx: SpendingTx,
  by: PurchaseGrouping,
  byId: ReadonlyMap<string, Transaction>,
): string | null {
  if (by === "category") {
    const choice = tx.type === "refund" ? refundCategory(tx, byId) : tx;
    return choice.subcategoryId ?? choice.categoryId ?? UNCATEGORIZED;
  }
  const purchase = purchaseOf(tx, byId);
  if (!purchase) return null;
  if (by === "merchant") return purchaseTextKey(purchase.merchant);
  if (by === "tile") {
    if (purchase.source !== "quick_add") return null;
    if (purchase.presetId) return purchase.presetId;
  }
  return purchaseTextKey(purchase.description);
}

/**
 * Under the threshold (strictly: at ₹50 a ₹50 purchase isn't small). A refund counts as small
 * when the purchase it refunds was, whatever the refund's own amount.
 */
export function isSmallPurchase(
  tx: SpendingTx,
  thresholdPaise: Paise,
  byId: ReadonlyMap<string, Transaction>,
): boolean {
  const purchase = purchaseOf(tx, byId);
  return (purchase ?? tx).amountPaise < thresholdPaise;
}

export interface PurchaseGroup {
  by: PurchaseGrouping;
  key: string;
  /** The wording used most often, or the category name. */
  label: string;
  /** Purchases (refunds aren't purchases). */
  count: number;
  refundCount: number;
  grossPaise: Paise;
  refundsPaise: Paise;
  netPaise: Paise;
  averagePaise: Paise | null;
  medianPaise: Paise | null;
  minPaise: Paise | null;
  maxPaise: Paise | null;
  /** Share of the period's net spending; null if either side isn't positive. */
  shareBp: number | null;
  transactionIds: string[];
}

function textOf(tx: ExpenseTransaction, by: PurchaseGrouping): string | null {
  return by === "merchant" ? tx.merchant : tx.description;
}

function commonestWording(texts: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const text of texts) counts.set(text, (counts.get(text) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
}

function buildPurchaseGroup(
  by: PurchaseGrouping,
  key: string,
  entries: readonly SpendingEntry[],
  totalNet: Paise,
  labelOf: (key: string) => string,
  tileLabels?: ReadonlyMap<string, string>,
): PurchaseGroup {
  const purchases = entries.flatMap((e) => (e.tx.type === "expense" ? [e.tx] : []));
  const stats = amountStats(purchases.map((tx) => tx.amountPaise));
  const refundsPaise = sumPaise(
    entries.filter((e) => e.tx.type === "refund").map((e) => e.tx.amountPaise),
  );
  const netPaise = subtractPaise(stats.totalPaise, refundsPaise);
  const texts = purchases.flatMap((tx) => textOf(tx, by)?.trim() || []);
  return {
    by,
    key,
    label:
      (by === "tile" ? tileLabels?.get(key) : undefined) ??
      (by !== "category" && texts.length > 0 ? commonestWording(texts) : labelOf(key)),
    count: stats.count,
    refundCount: entries.length - stats.count,
    grossPaise: stats.totalPaise,
    refundsPaise,
    netPaise,
    averagePaise: stats.averagePaise,
    medianPaise: stats.medianPaise,
    minPaise: stats.minPaise,
    maxPaise: stats.maxPaise,
    shareBp: netPaise < 0 ? null : ratioBasisPoints(netPaise, totalNet),
    transactionIds: entries.map((e) => e.tx.id),
  };
}

export interface PurchaseGroupOptions {
  by: PurchaseGrouping;
  /** Keep only small purchases under this amount. */
  underPaise?: Paise;
  labelOf?: (key: string) => string;
  /** Current tile names by id: a renamed tile shows its new name on its whole history. */
  tileLabels?: ReadonlyMap<string, string>;
}

/** Spending in a period grouped by `by`; entries with nothing to group by are left out. */
export function purchaseGroups(
  ledger: readonly Transaction[],
  period: Period,
  { by, underPaise, labelOf = (key) => key, tileLabels }: PurchaseGroupOptions,
): PurchaseGroup[] {
  const byId = indexById(ledger);
  const groups = new Map<string, SpendingEntry[]>();
  for (const entry of spendingEntries(ledger, period)) {
    if (underPaise !== undefined && !isSmallPurchase(entry.tx, underPaise, byId)) continue;
    const key = purchaseGroupKey(entry.tx, by, byId);
    if (key === null) continue;
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }
  const totalNet = netSpending(ledger, period);
  return [...groups]
    .map(([key, entries]) => buildPurchaseGroup(by, key, entries, totalNet, labelOf, tileLabels))
    .sort((a, b) => b.count - a.count || b.netPaise - a.netPaise || (a.key < b.key ? -1 : 1));
}

export interface SmallPurchaseTotal {
  thresholdPaise: Paise;
  count: number;
  refundCount: number;
  grossPaise: Paise;
  refundsPaise: Paise;
  netPaise: Paise;
  shareBp: number | null;
  transactionIds: string[];
}

export function smallPurchaseTotal(
  ledger: readonly Transaction[],
  period: Period,
  thresholdPaise: Paise,
): SmallPurchaseTotal {
  const byId = indexById(ledger);
  const entries = spendingEntries(ledger, period).filter((e) =>
    isSmallPurchase(e.tx, thresholdPaise, byId),
  );
  const purchases = entries.filter((e) => e.tx.type === "expense");
  const grossPaise = sumPaise(purchases.map((e) => e.tx.amountPaise));
  const netPaise = sumPaise(entries.map((e) => e.signedPaise));
  return {
    thresholdPaise,
    count: purchases.length,
    refundCount: entries.length - purchases.length,
    grossPaise,
    refundsPaise: subtractPaise(grossPaise, netPaise),
    netPaise,
    shareBp: netPaise < 0 ? null : ratioBasisPoints(netPaise, netSpending(ledger, period)),
    transactionIds: entries.map((e) => e.tx.id),
  };
}

// --- Money Leak Detector --------------------------------------------------------------------

export interface LeakGroup extends PurchaseGroup {
  /** Same group, same threshold, in the previous window; null with `comparisonNote` if unfair. */
  comparison: (Change & { previousCount: number }) | null;
  comparisonNote: string | null;
}

export interface LeakReport {
  groups: LeakGroup[];
  /** Net total of the listed groups. Groups don't overlap within one grouping. */
  netPaise: Paise;
  shareBp: number | null;
  /** Small purchases this grouping can't place (no merchant recorded, say). */
  ungroupedCount: number;
}

export interface LeakOptions {
  ledger: readonly Transaction[];
  period: Period;
  /** The window to compare with, or null when there isn't one (all time). */
  previous: Period | null;
  by: PurchaseGrouping;
  thresholdPaise: Paise;
  labelOf?: (key: string) => string;
  tileLabels?: ReadonlyMap<string, string>;
  minRepeats?: number;
}

export function leakReport({
  ledger,
  period,
  previous,
  by,
  thresholdPaise,
  labelOf,
  tileLabels,
  minRepeats = MIN_REPEATS,
}: LeakOptions): LeakReport {
  const options = { by, underPaise: thresholdPaise, labelOf, tileLabels };
  const all = purchaseGroups(ledger, period, options);
  const before = previous ? purchaseGroups(ledger, previous, options) : [];
  const beforeByKey = new Map(before.map((g) => [g.key, g]));
  const anyBefore = previous !== null && spendingEntries(ledger, previous).length > 0;
  const note = !previous
    ? "All time has no earlier period to compare with."
    : "Nothing was recorded in the previous period, so there’s nothing to compare yet.";

  const groups = all
    .filter((g) => g.count >= minRepeats)
    .map((g): LeakGroup => {
      const prev = beforeByKey.get(g.key);
      return {
        ...g,
        comparison: anyBefore
          ? { ...change(g.netPaise, prev?.netPaise ?? 0), previousCount: prev?.count ?? 0 }
          : null,
        comparisonNote: anyBefore ? null : note,
      };
    })
    .sort((a, b) => b.netPaise - a.netPaise || (a.key < b.key ? -1 : 1));

  const netPaise = sumPaise(groups.map((g) => g.netPaise));
  const small = smallPurchaseTotal(ledger, period, thresholdPaise);
  return {
    groups,
    netPaise,
    shareBp: netPaise < 0 ? null : ratioBasisPoints(netPaise, netSpending(ledger, period)),
    ungroupedCount: small.count - sumPaise(all.map((g) => g.count)),
  };
}

export interface WhatIf {
  fewer: number;
  typicalPaise: Paise;
  savedPaise: Paise;
  /** Every purchase was the same amount, so "₹25 coffees" is exact, not "about". */
  sameAmount: boolean;
}

/** A plain estimate: `fewer` purchases at the group's median price, capped at what happened. */
export function whatIf(group: PurchaseGroup, fewer: number): WhatIf {
  const typicalPaise = group.medianPaise ?? 0;
  const capped = Math.min(Math.max(0, Math.trunc(fewer)), group.count);
  return {
    fewer: capped,
    typicalPaise,
    savedPaise: multiplyPaise(typicalPaise, capped),
    sameAmount: group.minPaise === group.maxPaise,
  };
}

export function whatIfText(
  label: string,
  result: WhatIf,
  money: (paise: Paise) => string,
  span: string,
): string {
  const price = money(result.typicalPaise);
  const count = result.fewer === 1 ? "one" : String(result.fewer);
  const noun = result.fewer === 1 ? "entry" : "entries";
  const at = result.sameAmount ? `at ${price}` : `at about ${price}`;
  const less = `${result.sameAmount ? "" : "about "}${money(result.savedPaise)}`;
  return `If you logged ${count} fewer ${label} ${noun} ${at} in ${span}, you’d spend ${less} less.`;
}

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
