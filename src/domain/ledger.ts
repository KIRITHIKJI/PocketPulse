/**
 * Ledger helpers: which transactions count, idempotent mutations, refund linkage and integrity
 * checks. Derived totals are never stored — every figure is recomputed from the ledger, so an
 * edit or delete automatically flows into balances, budgets, goals, insights and reports.
 */
import { sumPaise, type Paise } from "./money";
import type { Account, RefundTransaction, Transaction } from "./schemas";
import { parseInstant, startOfLocalDate } from "./time";

/** Deleted and voided transactions are excluded from every calculation. */
export function isActive(tx: Transaction): boolean {
  return tx.deletedAt === null && tx.voidedAt === null;
}

export function activeTransactions(ledger: readonly Transaction[]): Transaction[] {
  return ledger.filter(isActive);
}

export function occurredAtMs(tx: Transaction): number {
  return parseInstant(tx.occurredAt);
}

export function indexById(ledger: readonly Transaction[]): Map<string, Transaction> {
  return new Map(ledger.map((tx) => [tx.id, tx]));
}

// --- Idempotent mutations ---------------------------------------------------------------

export type LedgerMutation =
  | { kind: "create"; tx: Transaction }
  | { kind: "update"; tx: Transaction; expectedUpdatedAt: string }
  | { kind: "delete"; id: string; at: string }
  | { kind: "restore"; id: string; at: string };

export type MutationOutcome = "applied" | "duplicate" | "conflict" | "not_found";

export interface MutationResult {
  ledger: Transaction[];
  outcome: MutationOutcome;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sameTransaction(a: Transaction, b: Transaction): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Applies one mutation. The client-generated transaction id is the idempotency key: replaying a
 * create (retry, sync replay) never produces a second row. A create that reuses an id with
 * different content, or an update based on a stale version, is a conflict — never a silent
 * overwrite.
 */
export function applyMutation(
  ledger: readonly Transaction[],
  mutation: LedgerMutation,
): MutationResult {
  const id =
    mutation.kind === "create" || mutation.kind === "update" ? mutation.tx.id : mutation.id;
  const index = ledger.findIndex((tx) => tx.id === id);
  const existing = index === -1 ? undefined : ledger[index];
  const replace = (tx: Transaction): MutationResult => ({
    ledger: ledger.map((row, i) => (i === index ? tx : row)),
    outcome: "applied",
  });
  const unchanged = (outcome: MutationOutcome): MutationResult => ({
    ledger: [...ledger],
    outcome,
  });

  switch (mutation.kind) {
    case "create":
      if (!existing) return { ledger: [...ledger, mutation.tx], outcome: "applied" };
      return unchanged(sameTransaction(existing, mutation.tx) ? "duplicate" : "conflict");
    case "update":
      if (!existing) return unchanged("not_found");
      if (sameTransaction(existing, mutation.tx)) return unchanged("duplicate");
      if (existing.ownerId !== mutation.tx.ownerId) return unchanged("conflict");
      if (existing.updatedAt !== mutation.expectedUpdatedAt) return unchanged("conflict");
      return replace(mutation.tx);
    case "delete":
      if (!existing) return unchanged("not_found");
      if (existing.deletedAt !== null) return unchanged("duplicate");
      return replace({ ...existing, deletedAt: mutation.at, updatedAt: mutation.at });
    case "restore":
      if (!existing) return unchanged("not_found");
      if (existing.deletedAt === null) return unchanged("duplicate");
      return replace({ ...existing, deletedAt: null, updatedAt: mutation.at });
  }
}

export function applyMutations(
  ledger: readonly Transaction[],
  mutations: readonly LedgerMutation[],
): { ledger: Transaction[]; outcomes: MutationOutcome[] } {
  let current = [...ledger];
  const outcomes: MutationOutcome[] = [];
  for (const m of mutations) {
    const result = applyMutation(current, m);
    current = result.ledger;
    outcomes.push(result.outcome);
  }
  return { ledger: current, outcomes };
}

// --- Refunds ------------------------------------------------------------------------------

/** Total active refunds recorded against an expense. */
export function refundedAmount(expenseId: string, ledger: readonly Transaction[]): Paise {
  return sumPaise(
    ledger
      .filter((tx): tx is RefundTransaction => tx.type === "refund" && isActive(tx))
      .filter((tx) => tx.refundOfId === expenseId)
      .map((tx) => tx.amountPaise),
  );
}

/** How much of an expense can still be refunded (0 if it is not an active expense). */
export function refundableAmount(expenseId: string, ledger: readonly Transaction[]): Paise {
  const expense = ledger.find((tx) => tx.id === expenseId);
  if (!expense || expense.type !== "expense" || !isActive(expense)) return 0;
  return Math.max(0, expense.amountPaise - refundedAmount(expenseId, ledger));
}

/** The category a refund reduces: its own, else the original expense's. */
export function refundCategory(
  refund: RefundTransaction,
  byId: ReadonlyMap<string, Transaction>,
): { categoryId: string | null; subcategoryId: string | null } {
  if (refund.categoryId)
    return { categoryId: refund.categoryId, subcategoryId: refund.subcategoryId };
  const original = byId.get(refund.refundOfId);
  if (original && original.type === "expense") {
    return { categoryId: original.categoryId, subcategoryId: original.subcategoryId };
  }
  return { categoryId: null, subcategoryId: null };
}

// --- Integrity ----------------------------------------------------------------------------

export type LedgerIssueCode =
  | "unknown_account"
  | "currency_mismatch"
  | "refund_without_expense"
  | "refund_before_expense"
  | "refund_exceeds_expense"
  | "release_exceeds_allocation"
  | "foreign_owner"
  | "before_opening_date";

export interface LedgerIssue {
  code: LedgerIssueCode;
  transactionId: string;
  message: string;
}

/**
 * Checks cross-record rules that a single-row schema can't express. Server mutations must reject
 * a change that introduces an issue; the UI uses the same messages.
 */
export function validateLedger(
  ledger: readonly Transaction[],
  accounts: readonly Account[],
  options: { ownerId?: string; timeZone?: string } = {},
): LedgerIssue[] {
  const issues: LedgerIssue[] = [];
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const active = activeTransactions(ledger);
  const byId = indexById(active);
  const add = (code: LedgerIssueCode, tx: Transaction, message: string) =>
    issues.push({ code, transactionId: tx.id, message });

  const refundTotals = new Map<string, Paise>();
  const goalBalances = new Map<string, Paise>();
  const chronological = [...active].sort((a, b) => occurredAtMs(a) - occurredAtMs(b));

  for (const tx of chronological) {
    if (options.ownerId && tx.ownerId !== options.ownerId) {
      add("foreign_owner", tx, "Transaction belongs to another user");
    }
    const accountIds =
      tx.type === "transfer"
        ? [tx.fromAccountId, tx.toAccountId]
        : "accountId" in tx
          ? [tx.accountId]
          : [];
    for (const accountId of accountIds) {
      const account = accountById.get(accountId);
      if (!account) {
        add("unknown_account", tx, "Account not found");
        continue;
      }
      if (account.currency !== tx.currency) {
        add(
          "currency_mismatch",
          tx,
          `Currency ${tx.currency} differs from account ${account.currency}`,
        );
      }
      if (occurredAtMs(tx) < startOfLocalDate(account.openingBalanceDate, options.timeZone)) {
        add(
          "before_opening_date",
          tx,
          `Dated before ${account.name}'s opening balance date (${account.openingBalanceDate}); it would not change the balance`,
        );
      }
    }

    if (tx.type === "refund") {
      const original = byId.get(tx.refundOfId);
      if (!original || original.type !== "expense") {
        add("refund_without_expense", tx, "A refund must be linked to an existing expense");
        continue;
      }
      if (occurredAtMs(tx) < occurredAtMs(original)) {
        add("refund_before_expense", tx, "A refund cannot be dated before its expense");
      }
      const total = (refundTotals.get(original.id) ?? 0) + tx.amountPaise;
      refundTotals.set(original.id, total);
      if (total > original.amountPaise) {
        add("refund_exceeds_expense", tx, "Refunds exceed the original expense amount");
      }
    }

    if (tx.type === "allocation" || tx.type === "allocation_release") {
      const delta = tx.type === "allocation" ? tx.amountPaise : -tx.amountPaise;
      const next = (goalBalances.get(tx.goalId) ?? 0) + delta;
      goalBalances.set(tx.goalId, next);
      if (next < 0) {
        add(
          "release_exceeds_allocation",
          tx,
          "Cannot release more than is set aside for this goal",
        );
      }
    }
  }
  return issues;
}
