/**
 * Converts database rows (snake_case, from supabase-js or node-postgres) into validated domain
 * records. All money math then runs in `@/domain`; nothing here calculates.
 *
 * int8 columns arrive as numbers from PostgREST and as strings from node-postgres; timestamps
 * as ISO strings or Date objects. Both are normalised and then validated by the domain schemas,
 * so a malformed row fails loudly instead of producing a wrong total.
 */
import {
  type Account,
  type AccountBalance,
  type Category,
  type ConsolidatedBalance,
  type LedgerBalances,
  type CategoryRule,
  type Commitment,
  type RecurringTemplate,
  type SavingsGoal,
  type Transaction,
  accountSchema,
  budgetSchema,
  categoryRuleSchema,
  categorySchema,
  commitmentSchema,
  recurringTemplateSchema,
  savingsGoalSchema,
  sumPaise,
  transactionSchema,
} from "@/domain";

type Row = Record<string, unknown>;

function paise(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new Error(`Expected integer paise, got ${String(value)}`);
  }
  return n;
}

function timestamp(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function localDate(value: unknown): string {
  // node-postgres parses `date` as a local-midnight Date; format it back without shifting.
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value);
}

function optionalDate(value: unknown): string | null {
  return value === null || value === undefined ? null : localDate(value);
}

export function rowToTransaction(row: Row): Transaction {
  const common = {
    id: row.id,
    ownerId: row.owner_id,
    type: row.type,
    amountPaise: paise(row.amount_paise),
    currency: row.currency,
    occurredAt: timestamp(row.occurred_at),
    description: row.description ?? null,
    merchant: row.merchant ?? null,
    note: row.note ?? null,
    tags: row.tags ?? [],
    source: row.source,
    batchId: row.batch_id ?? null,
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    deletedAt: timestamp(row.deleted_at),
    voidedAt: timestamp(row.voided_at),
  };
  const category = {
    categoryId: row.category_id ?? null,
    subcategoryId: row.subcategory_id ?? null,
  };
  const recurring = {
    recurringTemplateId: row.recurring_template_id ?? null,
    recurringOccurrence: optionalDate(row.recurring_occurrence),
  };
  switch (row.type) {
    case "income":
      return transactionSchema.parse({
        ...common,
        ...category,
        ...recurring,
        accountId: row.account_id,
      });
    case "expense":
      return transactionSchema.parse({
        ...common,
        ...category,
        ...recurring,
        accountId: row.account_id,
        presetId: row.preset_id ?? null,
      });
    case "refund":
      return transactionSchema.parse({
        ...common,
        ...category,
        accountId: row.account_id,
        refundOfId: row.refund_of_id,
      });
    case "transfer":
      return transactionSchema.parse({
        ...common,
        fromAccountId: row.from_account_id,
        toAccountId: row.to_account_id,
      });
    default:
      return transactionSchema.parse({ ...common, goalId: row.goal_id });
  }
}

/** A ledger row with its optimistic-concurrency version (what edits must quote). */
export function rowToLedgerRecord(row: Row): Transaction & { version: number } {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`Expected a row version, got ${String(row.version)}`);
  }
  return { ...rowToTransaction(row), version };
}

export function rowToAccount(row: Row): Account {
  return accountSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    kind: row.kind,
    currency: row.currency,
    openingBalancePaise: paise(row.opening_balance_paise),
    openingBalanceDate: localDate(row.opening_balance_date),
    isDefault: row.is_default ?? false,
    archivedAt: timestamp(row.archived_at),
  });
}

export function rowToCategory(row: Row): Category {
  return categorySchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    parentId: row.parent_id ?? null,
    kind: row.kind,
    name: row.name,
    icon: row.icon ?? null,
    color: row.color ?? null,
    sortOrder: row.sort_order ?? 0,
    isDefault: row.is_default ?? false,
    mergedIntoId: row.merged_into_id ?? null,
    archivedAt: timestamp(row.archived_at),
  });
}

export function rowToCategoryRule(row: Row): CategoryRule {
  return categoryRuleSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    matchText: row.match_text,
    matchField: row.match_field,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id ?? null,
    priority: row.priority ?? 0,
  });
}

export function rowToGoal(row: Row): SavingsGoal {
  return savingsGoalSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    icon: row.icon ?? null,
    targetPaise: paise(row.target_paise),
    targetDate: optionalDate(row.target_date),
    status: row.status,
    completedAt: timestamp(row.completed_at),
  });
}

export function rowToBudget(row: Row) {
  return budgetSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    categoryId: row.category_id ?? null,
    limitPaise: paise(row.limit_paise),
    period: row.period,
    customFrom: optionalDate(row.custom_from),
    customTo: optionalDate(row.custom_to),
    alertThresholdsBp: row.alert_thresholds_bp,
  });
}

export function rowToCommitment(row: Row): Commitment {
  return commitmentSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    amountPaise: paise(row.amount_paise),
    dueDate: localDate(row.due_date),
    categoryId: row.category_id ?? null,
    subcategoryId: row.subcategory_id ?? null,
    accountId: row.account_id ?? null,
    note: row.note ?? null,
    recurringTemplateId: row.recurring_template_id ?? null,
    recurringOccurrence: optionalDate(row.recurring_occurrence),
    paidTransactionId: row.paid_transaction_id ?? null,
    cancelledAt: timestamp(row.cancelled_at),
  });
}

export function rowToRecurringTemplate(row: Row): RecurringTemplate {
  return recurringTemplateSchema.parse({
    id: row.id,
    ownerId: row.owner_id,
    kind: row.kind,
    title: row.title,
    amountPaise: paise(row.amount_paise),
    accountId: row.account_id ?? null,
    categoryId: row.category_id ?? null,
    subcategoryId: row.subcategory_id ?? null,
    cadence: row.cadence,
    intervalCount: Number(row.interval_count ?? 1),
    anchorDate: localDate(row.anchor_date),
    nextDueDate: localDate(row.next_due_date),
    endDate: optionalDate(row.end_date),
    mode: row.mode,
    pausedAt: timestamp(row.paused_at),
    archivedAt: timestamp(row.archived_at),
  });
}

function optionalPaise(value: unknown): number | null {
  return value === null || value === undefined ? null : paise(value);
}

/**
 * The `wallet_balances` result as domain balances. The database sends each wallet's figure and
 * the totals; a total that isn't the sum of its wallets fails loudly rather than being shown.
 */
export function rowToLedgerBalances(
  value: unknown,
  closingMs: number,
  openingMs: number | null,
): LedgerBalances {
  const row = value as Row & { accounts: Row[] };
  const at = (asOfMs: number, key: "opening" | "closing"): ConsolidatedBalance => {
    const accounts = row.accounts.map((wallet): AccountBalance => {
      const balancePaise = optionalPaise(wallet[`${key}_paise`]);
      return {
        scope: "account",
        accountId: String(wallet.account_id),
        balancePaise,
        asOfMs,
        tracked: balancePaise !== null,
      };
    });
    const balancePaise = paise(row[`${key}_total_paise`]);
    if (sumPaise(accounts.map((b) => b.balancePaise ?? 0)) !== balancePaise) {
      throw new Error(`Wallet balances don't add up to the ${key} total`);
    }
    return {
      scope: "consolidated",
      balancePaise,
      asOfMs,
      accounts,
      untrackedAccountIds: accounts.filter((b) => !b.tracked).map((b) => b.accountId),
    };
  };
  return {
    opening: openingMs === null ? null : at(openingMs, "opening"),
    closing: at(closingMs, "closing"),
    entriesBeforeOpening: new Map(
      row.accounts.map((wallet) => [
        String(wallet.account_id),
        Number(wallet.entries_before_opening),
      ]),
    ),
  };
}
