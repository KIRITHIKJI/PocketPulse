import "server-only";

import { cache } from "react";

import type {
  Account,
  Budget,
  Category,
  CategoryRule,
  Commitment,
  CurrencyCode,
  RecurringTemplate,
  SavingsGoal,
  Transaction,
  Weekday,
} from "@/domain";
import { ensureDefaults } from "@/lib/auth/defaults";
import { DataLoadError } from "@/lib/data/errors";
import {
  rowToAccount,
  rowToBudget,
  rowToCategory,
  rowToCategoryRule,
  rowToCommitment,
  rowToGoal,
  rowToLedgerRecord,
  rowToRecurringTemplate,
  rowToTransaction,
} from "@/lib/data/mappers";
import { type Session, requireSession } from "@/lib/data/session";
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

const PAGE = 1000; // PostgREST's default max rows per request
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads every row of a query, page by page, so large ledgers are never silently truncated. */
async function fetchAll(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>,
  what: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new DataLoadError(what, error.code);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

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

export const getReminderPreferences = cache(async (): Promise<ReminderPreferences> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase.from("notification_preferences").select("*").maybeSingle();
  if (error) throw new DataLoadError("reminder preferences", error.code);
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

const getLedgerRows = cache(async (): Promise<Row[]> => {
  const { supabase } = await requireSession();
  return fetchAll(
    (from, to) =>
      supabase
        .from("transactions")
        .select("*")
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .order("id")
        .range(from, to),
    "your entries",
  );
});

/** Every non-deleted ledger row. Balances and history are rebuilt from these by `@/domain`. */
export const getLedger = cache(async (): Promise<Transaction[]> =>
  (await getLedgerRows()).map(rowToTransaction),
);

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

/** Every budget that isn't archived: total and per-category, in any period. */
export const getBudgets = cache(async (): Promise<Budget[]> => {
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
  return rows.map(rowToBudget);
});

/** Monthly budgets only (onboarding's starting budgets). */
export const getMonthlyBudgets = cache(async (): Promise<Budget[]> =>
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
export const getCommitments = cache(async (): Promise<Commitment[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase.from("commitments").select("*").order("due_date").order("id").range(from, to),
    "your planned bills",
  );
  return rows.map(rowToCommitment);
});

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
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new DataLoadError("that entry", error.code);
  return data ? rowToLedgerRecord(data) : null;
});
