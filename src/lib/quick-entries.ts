/**
 * Builds the quick-add tiles and the "log again" shortcuts (repeat last expense, frequent
 * entries) from the user's presets and ledger. Pure; the screens only render the result.
 */
import {
  type Category,
  type ExpenseTransaction,
  type Instant,
  type Transaction,
  categoryLabel,
  frequentExpenses,
  lastExpense,
  resolveCategoryChoice,
} from "@/domain";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";
import type { QuickAddPreset } from "@/lib/data/queries";

/** What the confirm sheet needs: a tile, "repeat last" or a frequent entry. */
export type QuickEntry = {
  key: string;
  /** Set for tiles: lets the sheet remember the amount as the tile's usual one. */
  presetId: string | null;
  title: string;
  icon: string | null;
  color: string | null;
  amountPaise: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  /** A repeat uses the original wallet when it's still active; otherwise the default wallet. */
  accountId: string | null;
  description: string | null;
  merchant: string | null;
  /** The custom tile: ask what it was and which category. */
  askDetails: boolean;
};

export type QuickShortcut = { kind: "repeat" | "frequent"; count?: number; entry: QuickEntry };

const ICONS = new Set<string>(CATEGORY_ICON_NAMES);

/** A tile's own icon if the app can draw it ("plus" from the seed reads as circle-plus). */
export function presetIcon(icon: string | null): string | null {
  if (icon === "plus") return "circle-plus";
  return icon && ICONS.has(icon) ? icon : null;
}

function style(
  choice: { categoryId: string | null; subcategoryId: string | null },
  byId: Map<string, Category>,
) {
  const main = choice.categoryId ? byId.get(choice.categoryId) : undefined;
  const sub = choice.subcategoryId ? byId.get(choice.subcategoryId) : undefined;
  return { icon: sub?.icon ?? main?.icon ?? null, color: sub?.color ?? main?.color ?? null };
}

export function tileEntries(presets: readonly QuickAddPreset[], categories: readonly Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return presets
    .filter((p) => !p.archived)
    .map((p): QuickEntry => {
      // Follows merges; an archived category leaves the tile asking for one.
      const choice = resolveCategoryChoice(p, byId, "expense");
      const look = choice ? style(choice, byId) : { icon: null, color: null };
      return {
        key: p.id,
        presetId: p.id,
        title: p.label,
        icon: presetIcon(p.icon) ?? look.icon,
        color: look.color,
        amountPaise: p.amountPaise,
        categoryId: choice?.categoryId ?? null,
        subcategoryId: choice?.subcategoryId ?? null,
        accountId: null,
        description: choice ? p.label : null,
        merchant: null,
        askDetails: choice === null,
      };
    });
}

function fromExpense(tx: ExpenseTransaction, key: string, byId: Map<string, Category>): QuickEntry {
  const choice = resolveCategoryChoice(tx, byId, "expense");
  const label = choice ? categoryLabel(choice, byId) : null;
  return {
    key,
    presetId: null,
    title: tx.description || tx.merchant || label?.split(" › ").pop() || "Expense",
    ...(choice ? style(choice, byId) : { icon: null, color: null }),
    amountPaise: tx.amountPaise,
    categoryId: choice?.categoryId ?? null,
    subcategoryId: choice?.subcategoryId ?? null,
    accountId: tx.accountId,
    description: tx.description,
    merchant: tx.merchant,
    askDetails: choice === null,
  };
}

export function shortcutEntries(
  ledger: readonly Transaction[],
  categories: readonly Category[],
  now: Instant,
): QuickShortcut[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const shortcuts: QuickShortcut[] = [];
  const last = lastExpense(ledger);
  if (last) shortcuts.push({ kind: "repeat", entry: fromExpense(last, `repeat-${last.id}`, byId) });
  for (const group of frequentExpenses(ledger, now, { limit: 5 })) {
    if (last && group.template.id === last.id) continue;
    shortcuts.push({
      kind: "frequent",
      count: group.count,
      entry: fromExpense(group.template, `frequent-${group.key}`, byId),
    });
  }
  return shortcuts.slice(0, 5);
}
