/**
 * Shortcuts for logging again what the user logs often: "repeat last expense" and "frequent
 * transactions". Both read only the user's own active entries; nothing is invented.
 */
import { normalizeText } from "./categorize";
import { isActive, occurredAtMs } from "./ledger";
import { parseInstant, type Instant } from "./time";
import type { ExpenseTransaction, Transaction } from "./schemas";

const DAY_MS = 86_400_000;

const isActiveExpense = (tx: Transaction): tx is ExpenseTransaction =>
  tx.type === "expense" && isActive(tx);

/** The expense recorded most recently (by when it was saved, not the date it happened). */
export function lastExpense(ledger: readonly Transaction[]): ExpenseTransaction | null {
  let best: ExpenseTransaction | null = null;
  for (const tx of ledger) {
    if (!isActiveExpense(tx)) continue;
    if (
      !best ||
      parseInstant(tx.createdAt) > parseInstant(best.createdAt) ||
      (tx.createdAt === best.createdAt && tx.id > best.id)
    ) {
      best = tx;
    }
  }
  return best;
}

export interface FrequentExpense {
  /** Stable key of the group: what, where, which category and how much. */
  key: string;
  /** The latest entry of the group: the template a repeat copies. */
  template: ExpenseTransaction;
  count: number;
}

/**
 * Expenses repeated at least `minCount` times in the last `days` days, grouped by description,
 * merchant, category and amount. Most frequent first; ties → most recent, then key.
 */
export function frequentExpenses(
  ledger: readonly Transaction[],
  now: Instant,
  options: { days?: number; limit?: number; minCount?: number } = {},
): FrequentExpense[] {
  const { days = 60, limit = 4, minCount = 2 } = options;
  const since = now - days * DAY_MS;
  const groups = new Map<string, { template: ExpenseTransaction; count: number }>();
  for (const tx of ledger) {
    if (!isActiveExpense(tx)) continue;
    const at = occurredAtMs(tx);
    if (at < since || at > now) continue;
    const key = [
      normalizeText(tx.description),
      normalizeText(tx.merchant),
      tx.categoryId ?? "",
      tx.subcategoryId ?? "",
      tx.amountPaise,
    ].join("|");
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { template: tx, count: 1 });
      continue;
    }
    group.count += 1;
    if (at > occurredAtMs(group.template)) group.template = tx;
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= minCount)
    .map(([key, g]) => ({ key, template: g.template, count: g.count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        occurredAtMs(b.template) - occurredAtMs(a.template) ||
        (a.key < b.key ? -1 : 1),
    )
    .slice(0, limit);
}
