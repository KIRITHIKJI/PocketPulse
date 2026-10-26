import "server-only";

import { cache } from "react";

import type { Account, Category, CategoryRule, CurrencyCode, Transaction, Weekday } from "@/domain";
import { ensureDefaults } from "@/lib/auth/defaults";
import { DataLoadError } from "@/lib/data/errors";
import {
  rowToAccount,
  rowToCategory,
  rowToCategoryRule,
  rowToTransaction,
} from "@/lib/data/mappers";
import { type Session, requireSession } from "@/lib/data/session";
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
  includeNotesInReports: boolean;
  onboardingCompletedAt: string | null;
}

type Row = Record<string, unknown>;

const PAGE = 1000; // PostgREST's default max rows per request

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

export interface BudgetRecord {
  id: string;
  categoryId: string | null;
  limitPaise: number;
}

/** Active monthly budgets (onboarding's starting budgets; the Budgets screen manages them all). */
export const getMonthlyBudgets = cache(async (): Promise<BudgetRecord[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, category_id, limit_paise")
    .eq("period", "monthly")
    .is("archived_at", null);
  if (error) throw new DataLoadError("your budgets", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    categoryId: (r.category_id as string | null) ?? null,
    limitPaise: Number(r.limit_paise),
  }));
});

export interface GoalRecord {
  id: string;
  title: string;
  targetPaise: number;
  targetDate: string | null;
}

export const getActiveGoals = cache(async (): Promise<GoalRecord[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("savings_goals")
    .select("id, title, target_paise, target_date")
    .eq("status", "active")
    .order("created_at");
  if (error) throw new DataLoadError("your goals", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    targetPaise: Number(r.target_paise),
    targetDate: (r.target_date as string | null) ?? null,
  }));
});
