/**
 * How one ledger entry reads in lists and detail views: title, category label, wallet and a
 * signed amount whose sign follows the money model (expense out, income/refund in, transfer and
 * savings moves neutral). Pure; amounts are formatted with the domain formatter.
 */
import {
  type Account,
  type Category,
  type CurrencyCode,
  type Transaction,
  type TransactionType,
  categoryLabel,
  formatMoney,
  occurredAtMs,
  refundableAmount,
} from "@/domain";

export const TYPE_LABELS: Record<TransactionType, string> = {
  expense: "Expense",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
  allocation: "Set aside for a goal",
  allocation_release: "Released from a goal",
};

export type AmountTone = "out" | "in" | "neutral";

export interface EntryView {
  id: string;
  type: TransactionType;
  title: string;
  /** "Food & Drinks › Tea", "Uncategorized", or null where categories don't apply. */
  categoryLabel: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  /** "Cash", or "Cash → Bank" for transfers. */
  walletLabel: string | null;
  amountLabel: string;
  tone: AmountTone;
  occurredAt: string;
  tags: string[];
}

export interface EntryContext {
  categoriesById: ReadonlyMap<string, Category>;
  accountsById: ReadonlyMap<string, Account>;
  ledgerById?: ReadonlyMap<string, Transaction>;
  currency: CurrencyCode;
}

function walletName(id: string, ctx: EntryContext) {
  return ctx.accountsById.get(id)?.name ?? "Unknown wallet";
}

export function entryCategory(tx: Transaction, ctx: EntryContext) {
  if (!("categoryId" in tx)) return null;
  let choice = { categoryId: tx.categoryId, subcategoryId: tx.subcategoryId };
  // A refund without its own category reduces the original expense's category.
  if (tx.type === "refund" && !tx.categoryId) {
    const original = ctx.ledgerById?.get(tx.refundOfId);
    if (original && original.type === "expense") {
      choice = { categoryId: original.categoryId, subcategoryId: original.subcategoryId };
    }
  }
  const main = choice.categoryId ? ctx.categoriesById.get(choice.categoryId) : undefined;
  const sub = choice.subcategoryId ? ctx.categoriesById.get(choice.subcategoryId) : undefined;
  return {
    label: categoryLabel(choice, ctx.categoriesById) ?? "Uncategorized",
    icon: sub?.icon ?? main?.icon ?? null,
    color: sub?.color ?? main?.color ?? null,
  };
}

export function entryView(tx: Transaction, ctx: EntryContext): EntryView {
  const money = (paise: number) => formatMoney(paise, { currency: ctx.currency });
  const category = entryCategory(tx, ctx);
  let walletLabel: string | null = null;
  let tone: AmountTone = "neutral";
  let amountLabel = money(tx.amountPaise);
  switch (tx.type) {
    case "expense":
      walletLabel = walletName(tx.accountId, ctx);
      tone = "out";
      amountLabel = `−${amountLabel}`;
      break;
    case "income":
    case "refund":
      walletLabel = walletName(tx.accountId, ctx);
      tone = "in";
      amountLabel = `+${amountLabel}`;
      break;
    case "transfer":
      walletLabel = `${walletName(tx.fromAccountId, ctx)} → ${walletName(tx.toAccountId, ctx)}`;
      break;
    default:
      break;
  }
  const title =
    tx.description ||
    tx.merchant ||
    (tx.type === "transfer" ? "Transfer" : null) ||
    (category && category.label !== "Uncategorized" ? category.label.split(" › ").pop()! : null) ||
    TYPE_LABELS[tx.type];
  return {
    id: tx.id,
    type: tx.type,
    title,
    categoryLabel: category?.label ?? null,
    categoryIcon: category?.icon ?? null,
    categoryColor: category?.color ?? null,
    walletLabel,
    amountLabel,
    tone,
    occurredAt: tx.occurredAt,
    tags: tx.tags,
  };
}

/** Expenses that can still take a refund, newest first, labelled for the "Refund of" picker. */
export function refundOptions(
  ledger: readonly Transaction[],
  ctx: EntryContext,
  formatDate: (iso: string) => string,
  limit = 100,
): { id: string; label: string }[] {
  return ledger
    .filter((tx) => tx.type === "expense" && refundableAmount(tx.id, ledger) > 0)
    .sort((a, b) => occurredAtMs(b) - occurredAtMs(a))
    .slice(0, limit)
    .map((tx) => {
      const view = entryView(tx, ctx);
      const left = refundableAmount(tx.id, ledger);
      const partly = left < tx.amountPaise;
      return {
        id: tx.id,
        label: `${view.title} · ${formatMoney(tx.amountPaise, { currency: ctx.currency })} · ${formatDate(tx.occurredAt)}${partly ? ` (${formatMoney(left, { currency: ctx.currency })} left)` : ""}`,
      };
    });
}
