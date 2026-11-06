import "server-only";

import { cache } from "react";

import {
  type Budget,
  type Commitment,
  type RecurringTemplate,
  type SavingsGoal,
  type Transaction,
} from "@/domain";
import { fetchAll } from "@/lib/data/paging";
import {
  rowToBudget,
  rowToCommitment,
  rowToGoal,
  rowToRecurringTemplate,
  rowToTransaction,
} from "@/lib/data/mappers";
import { requireSession } from "@/lib/data/session";
import { LEDGER_COLUMNS } from "./ledger";
import { type Row, UUID_PATTERN } from "./shared";

type BudgetRecord = Budget & { createdAt: string | null };

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
