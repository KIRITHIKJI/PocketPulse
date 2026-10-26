/**
 * Zod schemas and types for the ledger and planning records. These validate data at every
 * boundary (forms, server actions, sync replay, DB rows) before domain math touches it.
 *
 * Money model (spec §7):
 * - Amounts are positive integer paise. The `type` decides direction.
 * - income / expense / refund move money into or out of one tracked account.
 * - transfer moves money between two of the user's own accounts (nets to zero overall).
 * - allocation / allocation_release only earmark money for a savings goal; no account changes.
 *
 * REFUND CONVENTION (the only one used anywhere):
 * - A refund is its own `refund` transaction with a positive amount, linked to the original
 *   expense via `refundOfId`. It is never recorded as income and never as a negative expense.
 * - Balances: a refund adds money to its account (and to the consolidated balance).
 * - Spending: net spending = expenses − refunds. A refund reduces spending in the original
 *   expense's category/subcategory (unless the refund names its own), counted in the period in
 *   which the refund happened (its `occurredAt`), the same date rule as the balance.
 * - Income totals never include refunds. Reports show refunds as a separate line.
 * - The refunds linked to one expense may not exceed that expense, and a refund cannot be
 *   dated before its expense (`validateLedger`).
 *
 * Every money-moving transaction (income, expense, refund) belongs to an account. The app
 * creates a default wallet during onboarding and preselects it, so choosing an account stays
 * optional for the user while every balance stays well-defined.
 */
import { z } from "zod";

import { MAX_AMOUNT_PAISE, SUPPORTED_CURRENCIES } from "./money";
import { isLocalDate, isValidTimeZone } from "./time";

export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "refund",
  "transfer",
  "allocation",
  "allocation_release",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = [
  "manual",
  "quick_add",
  "parsed_text",
  "voice",
  "recurring",
  "import",
] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const amountPaiseSchema = z
  .number()
  .int("Amount must be whole paise")
  .positive("Amount must be more than ₹0")
  .max(MAX_AMOUNT_PAISE, "Amount is too large");

/** Opening balances may be zero or negative (e.g. an overdrawn account). */
export const signedPaiseSchema = z.number().int().min(-MAX_AMOUNT_PAISE).max(MAX_AMOUNT_PAISE);

export const currencySchema = z.enum(SUPPORTED_CURRENCIES);
export const localDateSchema = z.string().refine(isLocalDate, "Use a valid YYYY-MM-DD date");
export const timeZoneSchema = z.string().refine(isValidTimeZone, "Unknown timezone");
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

const optionalText = (max: number) => z.string().trim().max(max).nullable().default(null);

const commonFields = {
  id: z.uuid(),
  ownerId: z.uuid(),
  amountPaise: amountPaiseSchema,
  currency: currencySchema.default("INR"),
  occurredAt: isoDateTimeSchema,
  description: optionalText(200),
  merchant: optionalText(120),
  note: optionalText(1000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  source: z.enum(TRANSACTION_SOURCES).default("manual"),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Soft delete (undo-able). Deleted rows are excluded from every calculation. */
  deletedAt: isoDateTimeSchema.nullable().default(null),
  /** Voided for audit (kept visible in history, excluded from every calculation). */
  voidedAt: isoDateTimeSchema.nullable().default(null),
};

const categoryFields = {
  categoryId: z.uuid().nullable().default(null),
  subcategoryId: z.uuid().nullable().default(null),
};

export const incomeSchema = z.object({
  ...commonFields,
  ...categoryFields,
  type: z.literal("income"),
  accountId: z.uuid(),
});

export const expenseSchema = z.object({
  ...commonFields,
  ...categoryFields,
  type: z.literal("expense"),
  accountId: z.uuid(),
});

export const refundSchema = z.object({
  ...commonFields,
  ...categoryFields,
  type: z.literal("refund"),
  accountId: z.uuid(),
  refundOfId: z.uuid(),
});

export const transferSchema = z.object({
  ...commonFields,
  type: z.literal("transfer"),
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
});

export const allocationSchema = z.object({
  ...commonFields,
  type: z.literal("allocation"),
  goalId: z.uuid(),
});

export const allocationReleaseSchema = z.object({
  ...commonFields,
  type: z.literal("allocation_release"),
  goalId: z.uuid(),
});

export const transactionSchema = z
  .discriminatedUnion("type", [
    incomeSchema,
    expenseSchema,
    refundSchema,
    transferSchema,
    allocationSchema,
    allocationReleaseSchema,
  ])
  .superRefine((tx, ctx) => {
    if (tx.type === "transfer" && tx.fromAccountId === tx.toAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "A transfer needs two different accounts",
      });
    }
    if (tx.type === "refund" && tx.refundOfId === tx.id) {
      ctx.addIssue({
        code: "custom",
        path: ["refundOfId"],
        message: "A refund cannot refund itself",
      });
    }
    if ("subcategoryId" in tx && tx.subcategoryId && !tx.categoryId) {
      ctx.addIssue({
        code: "custom",
        path: ["subcategoryId"],
        message: "A subcategory needs its category",
      });
    }
  });

export type Transaction = z.output<typeof transactionSchema>;
export type TransactionInput = z.input<typeof transactionSchema>;
export type IncomeTransaction = Extract<Transaction, { type: "income" }>;
export type ExpenseTransaction = Extract<Transaction, { type: "expense" }>;
export type RefundTransaction = Extract<Transaction, { type: "refund" }>;
export type TransferTransaction = Extract<Transaction, { type: "transfer" }>;
export type AllocationTransaction = Extract<
  Transaction,
  { type: "allocation" | "allocation_release" }
>;

// --- Accounts ---------------------------------------------------------------

export const ACCOUNT_KINDS = ["cash", "bank", "upi_wallet", "card", "other"] as const;

export const accountSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  kind: z.enum(ACCOUNT_KINDS).default("cash"),
  currency: currencySchema.default("INR"),
  /** Tracked balance at the start of `openingBalanceDate` (local midnight in the user's timezone). */
  openingBalancePaise: signedPaiseSchema.default(0),
  /**
   * Tracking starts on this local date. Ledger activity dated before it is treated as already
   * included in the opening balance and is ignored by balance calculations.
   */
  openingBalanceDate: localDateSchema,
  /** The wallet preselected in every form that needs an account (exactly one per user). */
  isDefault: z.boolean().default(false),
  archivedAt: isoDateTimeSchema.nullable().default(null),
});
export type Account = z.output<typeof accountSchema>;

// --- Categories ------------------------------------------------------------------

export const CATEGORY_KINDS = ["expense", "income"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const categorySchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  /** null = a main category; otherwise its subcategory (one level of nesting). */
  parentId: z.uuid().nullable().default(null),
  kind: z.enum(CATEGORY_KINDS).default("expense"),
  name: z.string().trim().min(1).max(40),
  icon: z.string().max(40).nullable().default(null),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  sortOrder: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  /** Set when merged: the category its history moved to. Merged categories are also archived. */
  mergedIntoId: z.uuid().nullable().default(null),
  archivedAt: isoDateTimeSchema.nullable().default(null),
});
export type Category = z.output<typeof categorySchema>;

export const RULE_FIELDS = ["description", "merchant"] as const;

export const categoryRuleSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  matchText: z.string().trim().min(1).max(80),
  matchField: z.enum(RULE_FIELDS).default("description"),
  categoryId: z.uuid(),
  subcategoryId: z.uuid().nullable().default(null),
  /** Higher runs first. */
  priority: z.number().int().default(0),
});
export type CategoryRule = z.output<typeof categoryRuleSchema>;

// --- Savings goals -------------------------------------------------------------

export const GOAL_STATUSES = ["active", "paused", "completed", "archived"] as const;

export const savingsGoalSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string().trim().min(1).max(80),
  targetPaise: amountPaiseSchema,
  targetDate: localDateSchema.nullable().default(null),
  status: z.enum(GOAL_STATUSES).default("active"),
});
export type SavingsGoal = z.output<typeof savingsGoalSchema>;

// --- Planned / committed future expenses --------------------------------------

export const commitmentSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  amountPaise: amountPaiseSchema,
  dueDate: localDateSchema,
  /** Set when the bill has actually been paid: the expense that paid it. */
  paidTransactionId: z.uuid().nullable().default(null),
  cancelledAt: isoDateTimeSchema.nullable().default(null),
});
export type Commitment = z.output<typeof commitmentSchema>;

// --- Budgets -------------------------------------------------------------------

export const budgetSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    /** null = total budget across all spending categories. */
    categoryId: z.uuid().nullable().default(null),
    limitPaise: amountPaiseSchema,
    period: z.enum(["weekly", "monthly", "custom"]).default("monthly"),
    customFrom: localDateSchema.nullable().default(null),
    customTo: localDateSchema.nullable().default(null),
    /** Alert thresholds in basis points of the limit (8000 = 80 %). */
    alertThresholdsBp: z
      .array(z.number().int().min(1).max(100_000))
      .max(5)
      .default([5_000, 8_000, 10_000]),
  })
  .superRefine((b, ctx) => {
    if (b.period === "custom" && (!b.customFrom || !b.customTo)) {
      ctx.addIssue({ code: "custom", path: ["customFrom"], message: "Choose start and end dates" });
    }
    if (b.customFrom && b.customTo && b.customFrom > b.customTo) {
      ctx.addIssue({
        code: "custom",
        path: ["customTo"],
        message: "End date is before start date",
      });
    }
  });
export type Budget = z.output<typeof budgetSchema>;
export type BudgetInput = z.input<typeof budgetSchema>;
