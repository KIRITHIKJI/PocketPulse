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
  type Category,
  type CategoryRule,
  type Transaction,
  accountSchema,
  categoryRuleSchema,
  categorySchema,
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
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    deletedAt: timestamp(row.deleted_at),
    voidedAt: timestamp(row.voided_at),
  };
  const category = {
    categoryId: row.category_id ?? null,
    subcategoryId: row.subcategory_id ?? null,
  };
  switch (row.type) {
    case "income":
    case "expense":
      return transactionSchema.parse({ ...common, ...category, accountId: row.account_id });
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
