/**
 * Spending aggregation for insights, budgets and reports. Only expenses and refunds are
 * spending; income, transfers and allocations never appear here. Refunds follow the convention
 * in schemas.ts: they reduce net spending in the original expense's category, in the period
 * the refund happened. Every group carries the ids of the transactions behind it (drill-down).
 */
import {
  addPaise,
  divRound,
  formatINR,
  ratioBasisPoints,
  subtractPaise,
  sumPaise,
  type Paise,
} from "./money";
import { indexById, isActive, occurredAtMs, refundCategory } from "./ledger";
import type { ExpenseTransaction, RefundTransaction, Transaction } from "./schemas";
import { type Period, isInPeriod } from "./periods";

export const UNCATEGORIZED = "uncategorized";

export function transactionsInPeriod(
  ledger: readonly Transaction[],
  period: Period,
): Transaction[] {
  return ledger.filter((tx) => isActive(tx) && isInPeriod(occurredAtMs(tx), period));
}

export interface SpendingEntry {
  tx: ExpenseTransaction | RefundTransaction;
  categoryId: string | null;
  subcategoryId: string | null;
  /** +amount for an expense, −amount for a refund. */
  signedPaise: Paise;
  /** A refund whose original purchase happened before this period started. */
  refundOfEarlierPurchase: boolean;
}

/** Active expenses and refunds in the period, each resolved to the category it affects. */
export function spendingEntries(ledger: readonly Transaction[], period: Period): SpendingEntry[] {
  const byId = indexById(ledger);
  const entries: SpendingEntry[] = [];
  for (const tx of transactionsInPeriod(ledger, period)) {
    if (tx.type === "expense") {
      entries.push({
        tx,
        categoryId: tx.categoryId,
        subcategoryId: tx.subcategoryId,
        signedPaise: tx.amountPaise,
        refundOfEarlierPurchase: false,
      });
    } else if (tx.type === "refund") {
      const original = byId.get(tx.refundOfId);
      entries.push({
        tx,
        ...refundCategory(tx, byId),
        signedPaise: -tx.amountPaise,
        refundOfEarlierPurchase:
          original !== undefined &&
          period.startMs !== null &&
          occurredAtMs(original) < period.startMs,
      });
    }
  }
  return entries;
}

interface AmountStats {
  count: number;
  totalPaise: Paise;
  /** Mean rounded half-up to whole paise; null when there are no amounts. */
  averagePaise: Paise | null;
  /** Median (mean of the middle two for even counts, half-up); null when empty. */
  medianPaise: Paise | null;
  minPaise: Paise | null;
  maxPaise: Paise | null;
}

export function amountStats(amounts: readonly Paise[]): AmountStats {
  const count = amounts.length;
  const totalPaise = sumPaise(amounts);
  if (count === 0) {
    return {
      count,
      totalPaise,
      averagePaise: null,
      medianPaise: null,
      minPaise: null,
      maxPaise: null,
    };
  }
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(count / 2);
  const medianPaise =
    count % 2 === 1 ? sorted[mid]! : divRound(addPaise(sorted[mid - 1]!, sorted[mid]!), 2);
  return {
    count,
    totalPaise,
    averagePaise: divRound(totalPaise, count),
    medianPaise,
    minPaise: sorted[0]!,
    maxPaise: sorted[count - 1]!,
  };
}

export interface SpendingGroup {
  /** Category or subcategory id, or `UNCATEGORIZED`. */
  key: string;
  grossPaise: Paise;
  refundsPaise: Paise;
  /**
   * gross − refunds. Can be negative when refunds in this period are for purchases made in an
   * earlier period (see `earlierPurchaseRefundsPaise` and `spendingDisplay`).
   */
  netPaise: Paise;
  /** Part of `refundsPaise` refunding purchases made before this period. */
  earlierPurchaseRefundsPaise: Paise;
  /** Number of expenses (refunds aren't purchases). */
  count: number;
  refundCount: number;
  /** Average/median purchase, from expense amounts. */
  averagePaise: Paise | null;
  medianPaise: Paise | null;
  /**
   * Share of total net spending in basis points; null if the total isn't positive or this
   * group's net is negative (a negative share is meaningless).
   */
  shareBp: number | null;
  transactionIds: string[];
}

export interface CategoryGroup extends SpendingGroup {
  subcategories: SpendingGroup[];
}

export interface CategoryBreakdown {
  period: Period;
  grossPaise: Paise;
  refundsPaise: Paise;
  netPaise: Paise;
  expenseCount: number;
  categories: CategoryGroup[];
}

function buildGroup(
  key: string,
  entries: readonly SpendingEntry[],
  totalNet: Paise,
): SpendingGroup {
  const purchases = entries.filter((e) => e.tx.type === "expense").map((e) => e.signedPaise);
  const refundEntries = entries.filter((e) => e.tx.type === "refund");
  const stats = amountStats(purchases);
  const refundsPaise = sumPaise(refundEntries.map((e) => -e.signedPaise));
  const netPaise = subtractPaise(stats.totalPaise, refundsPaise);
  return {
    key,
    grossPaise: stats.totalPaise,
    refundsPaise,
    netPaise,
    earlierPurchaseRefundsPaise: sumPaise(
      refundEntries.filter((e) => e.refundOfEarlierPurchase).map((e) => -e.signedPaise),
    ),
    count: stats.count,
    refundCount: refundEntries.length,
    averagePaise: stats.averagePaise,
    medianPaise: stats.medianPaise,
    shareBp: netPaise < 0 ? null : ratioBasisPoints(netPaise, totalNet),
    transactionIds: entries.map((e) => e.tx.id),
  };
}

interface SpendingDisplay {
  /** Value for bars/rings: net spending floored at zero — charts never draw a negative bar. */
  chartPaise: Paise;
  /** When net is negative: the amount by which refunds exceeded this period's purchases. */
  netRefundPaise: Paise;
  /** Plain-language note to show beside the zero bar; null when net spending isn't negative. */
  note: string | null;
}

/**
 * How charts and reports show a group's spending. Net spending below zero happens when a refund
 * lands in a later period than its purchase; it is drawn as a zero bar with an explicit note,
 * and the refund stays visible as its own line — never a silent negative bar.
 */
export function spendingDisplay(
  group: SpendingGroup,
  format: (paise: Paise) => string = formatINR,
): SpendingDisplay {
  if (group.netPaise >= 0) return { chartPaise: group.netPaise, netRefundPaise: 0, note: null };
  const netRefundPaise = -group.netPaise;
  const fromEarlier =
    group.earlierPurchaseRefundsPaise > 0
      ? ` (${format(group.earlierPurchaseRefundsPaise)} of it refunds purchases from an earlier period)`
      : "";
  return {
    chartPaise: 0,
    netRefundPaise,
    note: `Refunds exceeded purchases here by ${format(netRefundPaise)}${fromEarlier}.`,
  };
}

/**
 * Shares of what the chart draws: each group's `chartPaise` over their sum, in basis points, so
 * the bars add up to 100 % even when a refund-heavy group is drawn at zero. (`shareBp` is relative
 * to the signed total, which goes above 100 % in that case.) Null when nothing is drawn.
 */
export function chartShares(groups: readonly SpendingGroup[]): Map<string, number | null> {
  const drawn = groups.map((g) => [g.key, spendingDisplay(g).chartPaise] as const);
  const total = sumPaise(drawn.map(([, paise]) => paise));
  return new Map(drawn.map(([key, paise]) => [key, ratioBasisPoints(paise, total)]));
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

const byNetDesc = (a: SpendingGroup, b: SpendingGroup) =>
  b.netPaise - a.netPaise || (a.key < b.key ? -1 : 1);

/** Category → subcategory totals, counts, average, median and share for a period. */
export function categoryBreakdown(
  ledger: readonly Transaction[],
  period: Period,
): CategoryBreakdown {
  const entries = spendingEntries(ledger, period);
  const grossPaise = sumPaise(entries.filter((e) => e.signedPaise > 0).map((e) => e.signedPaise));
  const refundsPaise = sumPaise(
    entries.filter((e) => e.signedPaise < 0).map((e) => -e.signedPaise),
  );
  const netPaise = subtractPaise(grossPaise, refundsPaise);

  const categories = [...groupBy(entries, (e) => e.categoryId ?? UNCATEGORIZED)].map(
    ([key, catEntries]): CategoryGroup => {
      const group = buildGroup(key, catEntries, netPaise);
      const subcategories = [...groupBy(catEntries, (e) => e.subcategoryId ?? UNCATEGORIZED)]
        .map(([subKey, subEntries]) => buildGroup(subKey, subEntries, group.netPaise))
        .sort(byNetDesc);
      return { ...group, subcategories };
    },
  );
  categories.sort(byNetDesc);

  return {
    period,
    grossPaise,
    refundsPaise,
    netPaise,
    expenseCount: entries.filter((e) => e.tx.type === "expense").length,
    categories,
  };
}

/** Net spending (expenses − refunds) in a period, optionally for one category. */
export function netSpending(
  ledger: readonly Transaction[],
  period: Period,
  categoryId?: string | null,
): Paise {
  return sumPaise(
    spendingEntries(ledger, period)
      .filter((e) => categoryId === undefined || e.categoryId === categoryId)
      .map((e) => e.signedPaise),
  );
}
