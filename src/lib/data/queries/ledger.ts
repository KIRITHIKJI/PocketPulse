import "server-only";

import { cache } from "react";

import {
  type Budget,
  type LedgerBalances,
  type Transaction,
  type Instant,
  budgetPeriod,
} from "@/domain";
import { DataLoadError } from "@/lib/data/errors";
import { afterLedgerRow, fetchLedgerPages } from "@/lib/data/paging";
import { rowToLedgerBalances, rowToLedgerRecord, rowToTransaction } from "@/lib/data/mappers";
import { type ServerClient, requireSession } from "@/lib/data/session";
import {
  earliestStart,
  isoInstant,
  mergeLedger,
  missingRefundOriginals,
  startForAnyZone,
} from "@/lib/data/slices";
import type { LedgerRecord } from "@/lib/ledger/commands";
import { type Row, UUID_PATTERN } from "./shared";

/** The ledger columns domain records use: everything but the idempotency key and void reason. */
export const LEDGER_COLUMNS = [
  "id",
  "owner_id",
  "type",
  "amount_paise",
  "currency",
  "occurred_at",
  "account_id",
  "from_account_id",
  "to_account_id",
  "goal_id",
  "refund_of_id",
  "category_id",
  "subcategory_id",
  "preset_id",
  "description",
  "merchant",
  "note",
  "tags",
  "source",
  "batch_id",
  "recurring_template_id",
  "recurring_occurrence",
  "version",
  "deleted_at",
  "voided_at",
  "created_at",
  "updated_at",
].join(", ");

function activeLedger(supabase: ServerClient) {
  return supabase.from("transactions").select<string, Row>(LEDGER_COLUMNS).is("deleted_at", null);
}

type LedgerQuery = ReturnType<typeof activeLedger>;

/** Every non-deleted row that `narrow` keeps, in ledger order, a page at a time. */
async function readLedgerRows(narrow: (query: LedgerQuery) => LedgerQuery): Promise<Row[]> {
  const { supabase } = await requireSession();
  return fetchLedgerPages((after, limit) => {
    const query = narrow(activeLedger(supabase));
    return (after ? query.or(afterLedgerRow(after)) : query)
      .order("occurred_at", { ascending: false })
      .order("id")
      .limit(limit);
  }, "your entries");
}

/** One bounded read, ordered and limited by `narrow`. */
async function readSomeLedgerRows(narrow: (query: LedgerQuery) => LedgerQuery): Promise<Row[]> {
  const { supabase } = await requireSession();
  const { data, error } = await narrow(activeLedger(supabase));
  if (error) throw new DataLoadError("your entries", error.code);
  return (data ?? []) as Row[];
}

const getLedgerRows = cache(() => readLedgerRows((query) => query));

/**
 * Every non-deleted ledger row. Only for screens whose figures span all history (the full
 * transaction list, category usage, recurring signals, rewards); others use `getLedgerSince`.
 */
export const getLedger = cache(async (): Promise<Transaction[]> =>
  (await getLedgerRows()).map(rowToTransaction),
);

/** `getLedger` read again, past the request cache: for a reward sync that must see a newer ledger. */
export async function readLedgerNow(): Promise<Transaction[]> {
  return (await readLedgerRows((query) => query)).map(rowToTransaction);
}

/** Rows written since `since` (an ISO instant), deleted ones included, with when and whether. */
export async function getLedgerStampsSince(
  since: string,
): Promise<{ id: string; updatedAt: string; deletedAt: string | null }[]> {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("transactions")
    .select("id, updated_at, deleted_at")
    .gte("updated_at", since)
    .limit(1_000);
  if (error) throw new DataLoadError("your entries", error.code);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    updatedAt: row.updated_at as string,
    deletedAt: (row.deleted_at as string | null) ?? null,
  }));
}

/**
 * `rows` plus the older purchases their refunds point at, which a refund's category and size
 * come from. The extra read only happens when such a purchase isn't among the rows already.
 */
async function withRefundOriginals(rows: Row[]): Promise<Transaction[]> {
  const ledger = rows.map(rowToTransaction);
  const missing = missingRefundOriginals(ledger);
  if (missing.length === 0) return ledger;
  const originals = await readLedgerRows((query) => query.in("id", missing));
  return mergeLedger(ledger, originals.map(rowToTransaction));
}

/**
 * Non-deleted rows dated from `since` on (an ISO instant; null = all of them), with the
 * purchases their refunds point at.
 */
export const getLedgerSince = cache(async (since: string | null): Promise<Transaction[]> =>
  since === null
    ? getLedger()
    : withRefundOriginals(await readLedgerRows((query) => query.gte("occurred_at", since))),
);

/**
 * The ledger a screen read from `since`, or a longer read when one of `budgets` (a custom one)
 * starts earlier than that.
 */
export async function withBudgetPeriods(
  window: Transaction[],
  since: Instant,
  budgets: readonly Budget[],
  now: Instant,
): Promise<Transaction[]> {
  if (budgets.length === 0) return window;
  const needed = earliestStart(
    since,
    startForAnyZone((settings) => budgets.map((budget) => budgetPeriod(budget, now, settings))),
  );
  return needed === since ? window : getLedgerSince(isoInstant(needed!));
}

/**
 * Every purchase and refund. For what spans all spending history: "looks recurring", the
 * earliest purchase, and which purchases can still be refunded.
 */
export const getSpendingLedger = cache(async (): Promise<Transaction[]> =>
  (await readLedgerRows((query) => query.in("type", ["expense", "refund"]))).map(rowToTransaction),
);

/** Whether any active purchase or refund exists. */
export const hasSpending = cache(
  async (): Promise<boolean> =>
    (
      await readSomeLedgerRows((query) =>
        query.in("type", ["expense", "refund"]).is("voided_at", null).limit(1),
      )
    ).length > 0,
);

/** Income dated from `since` on (an ISO instant; null = all of it). */
export const getIncomeSince = cache(async (since: string | null): Promise<Transaction[]> =>
  (
    await readLedgerRows((query) =>
      since === null
        ? query.eq("type", "income")
        : query.eq("type", "income").gte("occurred_at", since),
    )
  ).map(rowToTransaction),
);

const getGoalLedgerRows = cache(() =>
  readLedgerRows((query) => query.in("type", ["allocation", "allocation_release"])),
);

/** Every set-aside and release. Goal money spans all history, and there are few of these. */
export const getGoalLedger = cache(async (): Promise<Transaction[]> =>
  (await getGoalLedgerRows()).map(rowToTransaction),
);

/** Row versions of the set-asides and releases, for checked edits of them. */
export const getGoalLedgerVersions = cache(
  async (): Promise<Map<string, number>> =>
    new Map((await getGoalLedgerRows()).map((row) => [row.id as string, Number(row.version)])),
);

/** Every entry recorded for a recurring item: what makes an occurrence done. */
export const getRecurringEntries = cache(async (): Promise<Transaction[]> =>
  (await readLedgerRows((query) => query.not("recurring_template_id", "is", null))).map(
    rowToTransaction,
  ),
);

/** How many recent categorised entries category suggestions learn from. */
const SUGGESTION_HISTORY = 400;

/** The newest categorised spending and income: what "you chose this before" learns from. */
export const getSuggestionHistory = cache(async (): Promise<Transaction[]> =>
  (
    await readSomeLedgerRows((query) =>
      query
        .in("type", ["expense", "income"])
        .not("category_id", "is", null)
        .order("occurred_at", { ascending: false })
        .order("id")
        .limit(SUGGESTION_HISTORY),
    )
  ).map(rowToTransaction),
);

/** The expense recorded last (by when it was entered, not its date), for "Repeat last". */
export const getLatestExpense = cache(async (): Promise<Transaction[]> =>
  (
    await readSomeLedgerRows((query) =>
      query
        .eq("type", "expense")
        .is("voided_at", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1),
    )
  ).map(rowToTransaction),
);

/** The newest `count` entries in History's order, with the purchases their refunds point at. */
export const getRecentEntries = cache(async (count: number): Promise<Transaction[]> =>
  withRefundOriginals(
    await readSomeLedgerRows((query) =>
      query
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(count),
    ),
  ),
);

/** Whether any non-deleted entry exists. */
export const hasLedgerEntries = cache(
  async (): Promise<boolean> => (await readSomeLedgerRows((query) => query.limit(1))).length > 0,
);

/**
 * Wallet balances at `closing` and optionally `opening` (ISO instants), per wallet and in total,
 * from the `wallet_balances` database function. It takes no user id: it reads only the signed-in
 * user's rows, under RLS, and mirrors the domain's balance rules.
 */
export async function readWalletBalances(
  closing: string,
  opening: string | null = null,
): Promise<LedgerBalances> {
  const { supabase } = await requireSession();
  // A GET, since the function only reads: a dropped connection can then be retried. A GET sends
  // arguments as text, where null would arrive as "null", so no opening is left out instead.
  const { data, error } = await supabase.rpc(
    "wallet_balances",
    opening === null ? { p_closing: closing } : { p_closing: closing, p_opening: opening },
    { get: true },
  );
  if (error || !data) throw new DataLoadError("your balances", error?.code);
  return rowToLedgerBalances(
    data,
    Date.parse(closing),
    opening === null ? null : Date.parse(opening),
  );
}

/** `readWalletBalances`, once per request for the same instants. */
export const getWalletBalances = cache(readWalletBalances);

/** Row versions for optimistic-concurrency edits (`update_transaction`), keyed by id. */
export const getLedgerVersions = cache(
  async (): Promise<Map<string, number>> =>
    new Map((await getLedgerRows()).map((row) => [row.id as string, Number(row.version)])),
);

/** Any ledger row at all, deleted ones included — the rule that locks the currency. */
export const hasAnyTransactions = cache(async (): Promise<boolean> => {
  const { supabase } = await requireSession();
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true });
  if (error) throw new DataLoadError("your entries", error.code);
  return (count ?? 0) > 0;
});

/**
 * One active (not deleted) ledger row with its version, or null. RLS limits the read to the
 * signed-in user, so another user's id is indistinguishable from a missing one.
 */
export const getLedgerRecord = cache(async (id: string): Promise<LedgerRecord | null> => {
  if (!UUID_PATTERN.test(id)) return null;
  const { supabase } = await requireSession();
  const { data, error } = await activeLedger(supabase).eq("id", id).maybeSingle();
  if (error) throw new DataLoadError("that entry", error.code);
  return data ? rowToLedgerRecord(data) : null;
});
