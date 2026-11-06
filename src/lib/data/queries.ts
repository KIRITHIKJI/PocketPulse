import "server-only";

import { cache } from "react";

import {
  type Account,
  type Budget,
  type Category,
  type CategoryRule,
  type Commitment,
  type CurrencyCode,
  type LedgerBalances,
  type RecurringTemplate,
  type SavingsGoal,
  type Transaction,
  type ReminderSettings,
  type Weekday,
  type Instant,
  budgetPeriod,
} from "@/domain";
import { ensureDefaults } from "@/lib/auth/defaults";
import { DataLoadError } from "@/lib/data/errors";
import { afterLedgerRow, fetchAll, fetchLedgerPages } from "@/lib/data/paging";
import {
  rowToAccount,
  rowToBudget,
  rowToCategory,
  rowToCategoryRule,
  rowToCommitment,
  rowToGoal,
  rowToLedgerBalances,
  rowToLedgerRecord,
  rowToRecurringTemplate,
  rowToTransaction,
} from "@/lib/data/mappers";
import {
  type ServerClient,
  type Session,
  optionalSession,
  requireSession,
} from "@/lib/data/session";
import {
  earliestStart,
  isoInstant,
  mergeLedger,
  missingRefundOriginals,
  startForAnyZone,
} from "@/lib/data/slices";
import type { LedgerRecord } from "@/lib/ledger/commands";
import type { MotionPreference } from "@/lib/motion-preference";
import type {
  IncomeFrequency,
  ReminderPreferences,
  ThemePreference,
} from "@/lib/validation/settings";

export interface Profile {
  displayName: string | null;
  currency: CurrencyCode;
  timeZone: string;
  weekStartsOn: Weekday;
  theme: ThemePreference;
  motion: MotionPreference;
  smallPurchaseThresholdPaise: number;
  incomeFrequency: IncomeFrequency;
  nextIncomeDate: string | null;
  expectedIncomePaise: number | null;
  safeToSpendReservePaise: number;
  includeNotesInReports: boolean;
  onboardingCompletedAt: string | null;
}

type Row = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toProfile(row: Row): Profile {
  return {
    displayName: (row.display_name as string | null) ?? null,
    currency: row.currency as CurrencyCode,
    timeZone: row.time_zone as string,
    weekStartsOn: Number(row.week_starts_on) as Weekday,
    theme: row.theme as ThemePreference,
    motion: row.motion as MotionPreference,
    smallPurchaseThresholdPaise: Number(row.small_purchase_threshold_paise),
    incomeFrequency: row.income_frequency as IncomeFrequency,
    nextIncomeDate: (row.next_income_date as string | null) ?? null,
    expectedIncomePaise:
      row.expected_income_paise === null ? null : Number(row.expected_income_paise),
    safeToSpendReservePaise: Number(row.safe_to_spend_reserve_paise ?? 0),
    includeNotesInReports: Boolean(row.include_notes_in_reports),
    onboardingCompletedAt: (row.onboarding_completed_at as string | null) ?? null,
  };
}

/**
 * The signed-in user's profile. If it's missing (a user created before the signup trigger whose
 * defaults weren't backfilled), the idempotent defaults RPC runs once and the read is retried.
 */
export const getProfile = cache(async (): Promise<Profile> => {
  const { supabase } = await requireSession();
  const read = () => supabase.from("profiles").select("*").maybeSingle();
  let { data, error } = await read();
  if (!error && !data) {
    await ensureDefaults(supabase);
    ({ data, error } = await read());
  }
  if (error || !data) throw new DataLoadError("your profile", error?.code);
  return toProfile(data);
});

/** The one read of the reminder settings row; both views below are built from it. */
const getNotificationPreferencesRow = cache(async () => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase.from("notification_preferences").select("*").maybeSingle();
  if (error) throw new DataLoadError("reminder preferences", error.code);
  return data;
});

export const getReminderPreferences = cache(async (): Promise<ReminderPreferences> => {
  const data = await getNotificationPreferencesRow();
  return {
    allDisabled: Boolean(data?.all_disabled),
    missedLogging: Boolean(data?.missed_logging),
    weeklyReview: Boolean(data?.weekly_review),
    upcomingIncome: Boolean(data?.upcoming_income),
    budgetAlerts: data ? Boolean(data.budget_alerts) : true,
    upcomingCommitments: Boolean(data?.upcoming_commitments),
    savingsReview: Boolean(data?.savings_review),
  };
});

export const getReminderSettings = cache(async (): Promise<ReminderSettings> => {
  const [data, preferences] = await Promise.all([
    getNotificationPreferencesRow(),
    getReminderPreferences(),
  ]);
  return {
    ...preferences,
    missedLoggingTime: String(data?.missed_logging_time ?? "21:00").slice(0, 5),
    missedLoggingDays: data?.missed_logging_days ?? "daily",
    weeklyReviewDay: Number(data?.weekly_review_day ?? 0),
    upcomingIncomeDays: Number(data?.upcoming_income_days ?? 1),
    upcomingCommitmentDays: Number(data?.upcoming_commitment_days ?? 2),
    savingsReviewFrequency: data?.savings_review_frequency ?? "monthly",
  };
});

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  scheduledFor: string;
  read: boolean;
}

/** The newest reminders that haven't been dismissed. */
export const getNotifications = cache(async (): Promise<InboxNotification[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link_path, scheduled_for, read_at")
    .is("dismissed_at", null)
    .order("scheduled_for", { ascending: false })
    .limit(50);
  if (error) throw new DataLoadError("your reminders", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    linkPath: (r.link_path as string | null) ?? null,
    scheduledFor: r.scheduled_for as string,
    read: r.read_at !== null,
  }));
});

/**
 * Reminders not yet read or dismissed, for the header's bell; 0 when signed out. The layout
 * starts it with the profile read, so it doesn't add a round of its own to every page.
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const session = await optionalSession();
  if (!session) return 0;
  const { count } = await session.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("dismissed_at", null);
  return count ?? 0;
});

export interface AccountRecord extends Account {
  sortOrder: number;
}

/** All wallets, archived ones included (history and balances still use them). */
export const getAccounts = cache(async (): Promise<AccountRecord[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("accounts")
        .select("*")
        .order("is_default", { ascending: false })
        .order("sort_order")
        .order("created_at")
        .range(from, to),
    "your wallets",
  );
  return rows.map((row) => ({ ...rowToAccount(row), sortOrder: Number(row.sort_order ?? 0) }));
});

/** Returns the default wallet, creating "Cash" (₹0 from today) if the user has none yet. */
export async function ensureDefaultAccount(session?: Session): Promise<Account> {
  const { supabase } = session ?? (await requireSession());
  const { data, error } = await supabase.rpc("ensure_default_account");
  if (error || !data) throw new DataLoadError("your default wallet", error?.code);
  return rowToAccount(data as Row);
}

/**
 * All wallets and the default one. The default is found in the wallets already read, so only a
 * user who has none yet pays for the call that creates it; that wallet then joins the list.
 */
export const getAccountsWithDefault = cache(
  async (): Promise<{ accounts: AccountRecord[]; defaultAccount: Account }> => {
    const accounts = await getAccounts();
    const existing = accounts.find((account) => account.isDefault);
    if (existing) return { accounts, defaultAccount: existing };
    const created = await ensureDefaultAccount();
    const promoted = accounts.find((account) => account.id === created.id);
    return {
      // Listed first, as the database orders the default wallet.
      accounts: [
        { ...created, sortOrder: promoted?.sortOrder ?? 0 },
        ...accounts.filter((account) => account.id !== created.id),
      ],
      defaultAccount: created,
    };
  },
);

export const getCategories = cache(async (): Promise<Category[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase.from("categories").select("*").order("sort_order").order("id").range(from, to),
    "your categories",
  );
  return rows.map(rowToCategory);
});

export const getCategoryRules = cache(async (): Promise<CategoryRule[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("category_rules")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at")
        .range(from, to),
    "your category rules",
  );
  return rows.map(rowToCategoryRule);
});

/** The ledger columns domain records use: everything but the idempotency key and void reason. */
const LEDGER_COLUMNS = [
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

/** Non-deleted rows dated before `until` (an ISO instant). */
export const getLedgerBefore = cache(async (until: string): Promise<Transaction[]> =>
  (await readLedgerRows((query) => query.lt("occurred_at", until))).map(rowToTransaction),
);

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

export type BudgetRecord = Budget & { createdAt: string | null };

/** Every budget that isn't archived: total and per-category, in any period. */
export const getBudgets = cache(async (): Promise<BudgetRecord[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("budgets")
        .select("*")
        .is("archived_at", null)
        .order("created_at")
        .order("id")
        .range(from, to),
    "your budgets",
  );
  return rows.map((row) => ({
    ...rowToBudget(row),
    createdAt: (row.created_at as string | null) ?? null,
  }));
});

/** Monthly budgets only (onboarding's starting budgets). */
export const getMonthlyBudgets = cache(async (): Promise<BudgetRecord[]> =>
  (await getBudgets()).filter((b) => b.period === "monthly"),
);

/** Every goal. Paused, completed and archived ones keep their money and history. */
export const getGoals = cache(async (): Promise<SavingsGoal[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("savings_goals")
        .select("*")
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    "your goals",
  );
  return rows.map(rowToGoal);
});

export const getActiveGoals = cache(async (): Promise<SavingsGoal[]> =>
  (await getGoals()).filter((goal) => goal.status === "active"),
);

export const getGoal = cache(async (id: string): Promise<SavingsGoal | null> => {
  if (!UUID_PATTERN.test(id)) return null;
  return (await getGoals()).find((goal) => goal.id === id) ?? null;
});

/** One-off bills plus the rows that mark a recurring occurrence as skipped. */
export const getCommitments = cache(async (): Promise<Commitment[]> =>
  (await getCommitmentRows()).map(rowToCommitment),
);

/** Each bill with the entry that paid it, read together so no second round is needed. */
const getCommitmentRows = cache(async (): Promise<Row[]> => {
  const { supabase } = await requireSession();
  return fetchAll(
    (from, to) =>
      supabase
        .from("commitments")
        .select<string, Row>(
          `*, paid:transactions!commitments_owner_id_paid_transaction_id_fkey(${LEDGER_COLUMNS})`,
        )
        .order("due_date")
        .order("id")
        .range(from, to),
    "your planned bills",
  );
});

/** The entries that paid bills (not deleted ones): whether a bill is still paid. */
export const getCommitmentPayments = cache(async (): Promise<Transaction[]> =>
  (await getCommitmentRows()).flatMap((row) => {
    const paid = row.paid as Row | null;
    return paid && paid.deleted_at === null ? [rowToTransaction(paid)] : [];
  }),
);

export const getRecurringTemplates = cache(async (): Promise<RecurringTemplate[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("recurring_templates")
        .select("*")
        .order("next_due_date")
        .order("id")
        .range(from, to),
    "your recurring items",
  );
  return rows.map(rowToRecurringTemplate);
});

export interface QuickAddPreset {
  id: string;
  label: string;
  icon: string | null;
  /** null = ask every time (tiles start without amounts; the app never invents prices). */
  amountPaise: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  archived: boolean;
}

/** Quick-add tiles in display order, hidden ones included (the editor can restore them). */
export const getQuickAddPresets = cache(async (): Promise<QuickAddPreset[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("quick_add_presets")
    .select("id, label, icon, amount_paise, category_id, subcategory_id, archived_at")
    .order("sort_order")
    .order("created_at");
  if (error) throw new DataLoadError("your quick-add tiles", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    icon: (r.icon as string | null) ?? null,
    amountPaise: r.amount_paise === null ? null : Number(r.amount_paise),
    categoryId: (r.category_id as string | null) ?? null,
    subcategoryId: (r.subcategory_id as string | null) ?? null,
    archived: r.archived_at !== null,
  }));
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
