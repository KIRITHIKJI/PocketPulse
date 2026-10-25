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
import {
  DEFAULT_TIME_SETTINGS,
  type LocalDate,
  type Period,
  type TimeSettings,
  addMonths,
  eachDay,
  isInPeriod,
  startOfMonth,
  startOfWeek,
  toLocalDate,
} from "./time";

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

export interface AmountStats {
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

export interface SpendingDisplay {
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
export function spendingDisplay(group: SpendingGroup): SpendingDisplay {
  if (group.netPaise >= 0) return { chartPaise: group.netPaise, netRefundPaise: 0, note: null };
  const netRefundPaise = -group.netPaise;
  const fromEarlier =
    group.earlierPurchaseRefundsPaise > 0
      ? ` (${formatINR(group.earlierPurchaseRefundsPaise)} of it refunds purchases from an earlier period)`
      : "";
  return {
    chartPaise: 0,
    netRefundPaise,
    note: `Refunds exceeded purchases here by ${formatINR(netRefundPaise)}${fromEarlier}.`,
  };
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

// --- Period comparison ------------------------------------------------------------------

export interface Change {
  currentPaise: Paise;
  previousPaise: Paise;
  deltaPaise: Paise;
  /** Relative change in bp; null when the previous amount isn't positive (no baseline). */
  deltaBp: number | null;
}

function change(currentPaise: Paise, previousPaise: Paise): Change {
  return {
    currentPaise,
    previousPaise,
    deltaPaise: subtractPaise(currentPaise, previousPaise),
    deltaBp: ratioBasisPoints(subtractPaise(currentPaise, previousPaise), previousPaise),
  };
}

export interface CategoryChange extends Change {
  key: string;
  /** Subcategory with the largest absolute change ("mainly due to snacks"), if any changed. */
  mainDriver: (Change & { key: string }) | null;
}

export interface PeriodComparison {
  total: Change;
  categories: CategoryChange[];
  /** False when either period has too few purchases for a fair comparison. */
  comparable: boolean;
  reason: string | null;
}

/**
 * Compares two breakdowns (usually a period and `previousPeriod(period)`). With fewer than
 * `minTransactions` purchases in either period, the numbers are still returned but marked not
 * comparable, with the reason, so the UI can say the data is too sparse instead of
 * inventing a trend.
 */
export function comparePeriods(
  current: CategoryBreakdown,
  previous: CategoryBreakdown,
  options: { minTransactions?: number } = {},
): PeriodComparison {
  const min = options.minTransactions ?? 3;
  const prevByKey = new Map(previous.categories.map((c) => [c.key, c]));
  const curByKey = new Map(current.categories.map((c) => [c.key, c]));
  const keys = [...new Set([...curByKey.keys(), ...prevByKey.keys()])];

  const categories = keys.map((key): CategoryChange => {
    const cur = curByKey.get(key);
    const prev = prevByKey.get(key);
    const subPrev = new Map(prev?.subcategories.map((s) => [s.key, s.netPaise]) ?? []);
    const subCur = new Map(cur?.subcategories.map((s) => [s.key, s.netPaise]) ?? []);
    let mainDriver: CategoryChange["mainDriver"] = null;
    for (const subKey of new Set([...subCur.keys(), ...subPrev.keys()])) {
      const c = change(subCur.get(subKey) ?? 0, subPrev.get(subKey) ?? 0);
      if (
        c.deltaPaise !== 0 &&
        (!mainDriver || Math.abs(c.deltaPaise) > Math.abs(mainDriver.deltaPaise))
      ) {
        mainDriver = { key: subKey, ...c };
      }
    }
    return { key, ...change(cur?.netPaise ?? 0, prev?.netPaise ?? 0), mainDriver };
  });
  categories.sort(
    (a, b) => Math.abs(b.deltaPaise) - Math.abs(a.deltaPaise) || (a.key < b.key ? -1 : 1),
  );

  let reason: string | null = null;
  if (previous.expenseCount < min) {
    reason = `The previous period has only ${previous.expenseCount} purchase${previous.expenseCount === 1 ? "" : "s"}; at least ${min} are needed for a fair comparison.`;
  } else if (current.expenseCount < min) {
    reason = `This period has only ${current.expenseCount} purchase${current.expenseCount === 1 ? "" : "s"} so far; at least ${min} are needed for a fair comparison.`;
  }
  return {
    total: change(current.netPaise, previous.netPaise),
    categories,
    comparable: !reason,
    reason,
  };
}

// --- Trends -------------------------------------------------------------------------------

export type TrendGranularity = "day" | "week" | "month";

export interface TrendBucket {
  /** First local day of the bucket. */
  startDate: LocalDate;
  netPaise: Paise;
  count: number;
  transactionIds: string[];
}

/** Net spending per day/week/month across a bounded period, including empty buckets. */
export function spendingTrend(
  ledger: readonly Transaction[],
  period: Period,
  granularity: TrendGranularity,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): TrendBucket[] {
  const keyOf = (date: LocalDate) =>
    granularity === "day"
      ? date
      : granularity === "week"
        ? startOfWeek(date, settings.weekStartsOn)
        : startOfMonth(date);

  const buckets = new Map<LocalDate, TrendBucket>();
  for (const day of eachDay(period)) {
    const key = keyOf(day);
    if (!buckets.has(key))
      buckets.set(key, { startDate: key, netPaise: 0, count: 0, transactionIds: [] });
  }
  for (const entry of spendingEntries(ledger, period)) {
    const key = keyOf(toLocalDate(occurredAtMs(entry.tx), period.timeZone));
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { startDate: key, netPaise: 0, count: 0, transactionIds: [] };
      buckets.set(key, bucket);
    }
    bucket.netPaise = addPaise(bucket.netPaise, entry.signedPaise);
    if (entry.tx.type === "expense") bucket.count++;
    bucket.transactionIds.push(entry.tx.id);
  }
  return [...buckets.values()].sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/** Month starts covering `months` complete months before the month containing `date`. */
export function previousMonthStarts(date: LocalDate, months: number): LocalDate[] {
  const thisMonth = startOfMonth(date);
  return Array.from({ length: months }, (_, i) => addMonths(thisMonth, -(i + 1)));
}
