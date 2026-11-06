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
  type SpendingEntry,
  UNCATEGORIZED,
  amountStats,
  netSpending,
  spendingEntries,
} from "./aggregation";
import { normalizeText, significantTokens } from "./category-tree";
import { indexById, refundCategory } from "./ledger";
import { type Paise, ratioBasisPoints, subtractPaise, sumPaise } from "./money";
import type { ExpenseTransaction, RefundTransaction, Transaction } from "./schemas";
import { type Period } from "./periods";

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

interface PurchaseGroupOptions {
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
