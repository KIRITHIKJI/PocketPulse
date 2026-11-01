/**
 * Transaction history: filters from the URL, search, and grouping by local day. Pure, so the
 * same rules apply wherever history is shown. Filters live in the URL (a GET form), which keeps
 * them shareable, bookmarkable and working before JavaScript loads.
 */
import {
  type Account,
  type Category,
  type LocalDate,
  PURCHASE_GROUPINGS,
  type PurchaseGrouping,
  TRANSACTION_TYPES,
  type Transaction,
  type TransactionType,
  isActive,
  isLocalDate,
  isSmallPurchase,
  normalizeText,
  occurredAtMs,
  parseAmountInput,
  purchaseGroupKey,
  refundCategory,
  startOfLocalDate,
  addDays,
  toLocalDate,
  parseInstant,
} from "@/domain";
import { entryCategory } from "@/lib/entry-view";

export const UNCATEGORIZED_FILTER = "uncategorized";
/** Expenses and refunds together: what net spending is made of. */
export const SPENDING_FILTER = "spending";

export interface HistoryFilters {
  q: string;
  type: TransactionType | typeof SPENDING_FILTER | null;
  /** A main category or subcategory id, or `UNCATEGORIZED_FILTER`. */
  category: string | null;
  /** With `category`: only entries with no subcategory. */
  noSubcategory: boolean;
  account: string | null;
  from: LocalDate | null;
  to: LocalDate | null;
  minPaise: number | null;
  maxPaise: number | null;
  /** Small purchases under this amount, plus refunds of them (see `isSmallPurchase`). */
  underPaise: number | null;
  /** One group of repeated purchases (see `purchaseGroupKey`). */
  group: { by: PurchaseGrouping; key: string } | null;
}

export type FilterErrors = Partial<Record<"from" | "to" | "min" | "max", string>>;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Reads filters from search params. Invalid values are reported and ignored, never guessed. */
export function parseHistoryFilters(params: Params): {
  filters: HistoryFilters;
  errors: FilterErrors;
} {
  const errors: FilterErrors = {};
  const type = first(params.type);
  const date = (key: "from" | "to") => {
    const value = first(params[key]);
    if (!value) return null;
    if (isLocalDate(value)) return value;
    errors[key] = "Choose a valid date.";
    return null;
  };
  const amount = (key: "min" | "max") => {
    const value = first(params[key]);
    if (!value) return null;
    const parsed = parseAmountInput(value, { allowZero: true });
    if (parsed.ok) return parsed.paise;
    errors[key] = parsed.message;
    return null;
  };
  const under = parseAmountInput(first(params.under));
  const by = first(params.by);
  const key = first(params.key);
  const filters: HistoryFilters = {
    q: first(params.q).slice(0, 100),
    type:
      type === SPENDING_FILTER
        ? SPENDING_FILTER
        : (TRANSACTION_TYPES as readonly string[]).includes(type)
          ? (type as TransactionType)
          : null,
    category: first(params.category) || null,
    noSubcategory: first(params.nosub) === "1",
    account: first(params.account) || null,
    from: date("from"),
    to: date("to"),
    minPaise: amount("min"),
    maxPaise: amount("max"),
    underPaise: under.ok ? under.paise : null,
    group:
      key && (PURCHASE_GROUPINGS as readonly string[]).includes(by)
        ? { by: by as PurchaseGrouping, key }
        : null,
  };
  if (filters.from && filters.to && filters.from > filters.to) {
    errors.to = "The end date is before the start date.";
    filters.to = null;
  }
  if (
    filters.minPaise !== null &&
    filters.maxPaise !== null &&
    filters.minPaise > filters.maxPaise
  ) {
    errors.max = "The maximum is below the minimum.";
    filters.maxPaise = null;
  }
  return { filters, errors };
}

/** How many filters (besides search) are active — for the "Filters (2)" label. */
export function activeFilterCount(f: HistoryFilters): number {
  return [
    f.type,
    f.category,
    f.account,
    f.from,
    f.to,
    f.minPaise,
    f.maxPaise,
    f.underPaise,
    f.group,
  ].filter((v) => v !== null).length;
}

export interface HistoryContext {
  categoriesById: ReadonlyMap<string, Category>;
  accountsById: ReadonlyMap<string, Account>;
  ledgerById: ReadonlyMap<string, Transaction>;
  timeZone: string;
}

function accountIds(tx: Transaction): string[] {
  if (tx.type === "transfer") return [tx.fromAccountId, tx.toAccountId];
  return "accountId" in tx ? [tx.accountId] : [];
}

function matchesCategory(
  tx: Transaction,
  category: string,
  noSubcategory: boolean,
  ctx: HistoryContext,
) {
  if (!("categoryId" in tx)) return false;
  // Refunds without their own category count under the original expense's category.
  const { categoryId, subcategoryId } =
    tx.type === "refund" ? refundCategory(tx, ctx.ledgerById) : tx;
  if (noSubcategory && subcategoryId !== null) return false;
  if (category === UNCATEGORIZED_FILTER) return categoryId === null;
  return categoryId === category || subcategoryId === category;
}

function searchText(tx: Transaction, ctx: HistoryContext): string {
  const parts = [tx.description, tx.merchant, tx.note, ...tx.tags];
  parts.push(entryCategory(tx, { ...ctx, currency: "INR" })?.label ?? null);
  for (const id of accountIds(tx)) parts.push(ctx.accountsById.get(id)?.name ?? null);
  return normalizeText(parts.filter(Boolean).join(" "));
}

/** Newest first: by when it happened, then by when it was recorded. */
export function newestFirst(a: Transaction, b: Transaction): number {
  return (
    occurredAtMs(b) - occurredAtMs(a) ||
    parseInstant(b.createdAt) - parseInstant(a.createdAt) ||
    (a.id < b.id ? 1 : -1)
  );
}

export function filterHistory(
  ledger: readonly Transaction[],
  f: HistoryFilters,
  ctx: HistoryContext,
): Transaction[] {
  const words = normalizeText(f.q).split(" ").filter(Boolean);
  const fromMs = f.from ? startOfLocalDate(f.from, ctx.timeZone) : null;
  const toMs = f.to ? startOfLocalDate(addDays(f.to, 1), ctx.timeZone) : null;
  return ledger
    .filter((tx) => {
      if (tx.deletedAt !== null) return false;
      if (f.type === SPENDING_FILTER) {
        // Voided rows stay visible in plain history, but they aren't part of any spending total.
        if ((tx.type !== "expense" && tx.type !== "refund") || !isActive(tx)) return false;
      } else if (f.type && tx.type !== f.type) return false;
      if (f.account && !accountIds(tx).includes(f.account)) return false;
      if (f.category && !matchesCategory(tx, f.category, f.noSubcategory, ctx)) return false;
      if (f.underPaise !== null) {
        if (tx.type !== "expense" && tx.type !== "refund") return false;
        if (!isSmallPurchase(tx, f.underPaise, ctx.ledgerById)) return false;
      }
      if (f.group) {
        if (tx.type !== "expense" && tx.type !== "refund") return false;
        if (purchaseGroupKey(tx, f.group.by, ctx.ledgerById) !== f.group.key) return false;
      }
      const at = occurredAtMs(tx);
      if (fromMs !== null && at < fromMs) return false;
      if (toMs !== null && at >= toMs) return false;
      if (f.minPaise !== null && tx.amountPaise < f.minPaise) return false;
      if (f.maxPaise !== null && tx.amountPaise > f.maxPaise) return false;
      if (words.length > 0) {
        const haystack = ` ${searchText(tx, ctx)} `;
        if (!words.every((w) => haystack.includes(w))) return false;
      }
      return true;
    })
    .sort(newestFirst);
}

export interface DayGroup {
  date: LocalDate;
  entries: Transaction[];
}

/** Consecutive entries grouped by their local day (input must already be newest first). */
export function groupByDay(entries: readonly Transaction[], timeZone: string): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const tx of entries) {
    const date = toLocalDate(occurredAtMs(tx), timeZone);
    const last = groups.at(-1);
    if (last && last.date === date) last.entries.push(tx);
    else groups.push({ date, entries: [tx] });
  }
  return groups;
}
