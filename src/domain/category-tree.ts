/** Category text matching and hierarchy helpers: normalising names, the tree, labels and merges. */
import type { Category, CategoryKind } from "./schemas";

export interface CategoryChoice {
  categoryId: string;
  subcategoryId: string | null;
}

// --- Text -----------------------------------------------------------------------------------

/** Lowercase words only: "Chai @ Ramu's!! ₹15" → "chai ramu s". Digits and symbols are dropped. */
export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "to",
  "at",
  "in",
  "on",
  "of",
  "my",
  "a",
  "an",
  "rs",
  "inr",
  "rupees",
  "paid",
  "bought",
  "today",
  "yesterday",
]);

/** Words that can identify a purchase: 3+ letters, not filler. */
export function significantTokens(text: string | null | undefined): string[] {
  return [...new Set(normalizeText(text).split(" "))].filter(
    (t) => t.length >= 3 && !STOP_WORDS.has(t),
  );
}

/** Whole-word/phrase containment on normalized text ("tea" matches "masala tea", not "steam"). */
export function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

// --- Hierarchy ------------------------------------------------------------------------------

export function isCategoryActive(category: Category): boolean {
  return category.archivedAt === null && category.mergedIntoId === null;
}

interface CategoryNode {
  category: Category;
  subcategories: Category[];
}

const byOrder = (a: Category, b: Category) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * Main categories of one kind with their subcategories, in display order. By default only
 * active ones (what pickers show); `includeInactive` also returns archived/merged rows.
 */
export function categoryTree(
  categories: readonly Category[],
  kind: CategoryKind,
  options: { includeInactive?: boolean } = {},
): CategoryNode[] {
  const visible = (c: Category) => options.includeInactive || isCategoryActive(c);
  const mains = categories.filter((c) => c.kind === kind && c.parentId === null && visible(c));
  return mains.sort(byOrder).map((category) => ({
    category,
    subcategories: categories.filter((c) => c.parentId === category.id && visible(c)).sort(byOrder),
  }));
}

/** Follows merges to the category that holds the history now; null if it's archived or missing. */
function resolveCategory(
  id: string | null,
  categoriesById: ReadonlyMap<string, Category>,
): Category | null {
  let current = id ? categoriesById.get(id) : undefined;
  for (let hops = 0; current && current.mergedIntoId && hops < 10; hops++) {
    current = categoriesById.get(current.mergedIntoId);
  }
  if (!current || !isCategoryActive(current)) return null;
  return current;
}

/**
 * Turns a stored (category, subcategory) pair into one that is valid today, following merges.
 * An archived subcategory falls back to its main category. Returns null if the main category is
 * archived or of the wrong kind.
 */
export function resolveCategoryChoice(
  choice: { categoryId: string | null; subcategoryId: string | null },
  categoriesById: ReadonlyMap<string, Category>,
  kind?: CategoryKind,
): CategoryChoice | null {
  const sub = resolveCategory(choice.subcategoryId, categoriesById);
  let result: CategoryChoice | null = null;
  if (sub) {
    result = sub.parentId
      ? { categoryId: sub.parentId, subcategoryId: sub.id }
      : { categoryId: sub.id, subcategoryId: null };
  } else {
    const main = resolveCategory(choice.categoryId, categoriesById);
    if (main) {
      result = main.parentId
        ? { categoryId: main.parentId, subcategoryId: main.id }
        : { categoryId: main.id, subcategoryId: null };
    }
  }
  if (!result) return null;
  const main = categoriesById.get(result.categoryId);
  if (!main || !isCategoryActive(main) || main.parentId !== null) return null;
  if (kind && main.kind !== kind) return null;
  return result;
}

/** "Food & Drinks › Tea", or just "Food & Drinks". */
export function categoryLabel(
  choice: { categoryId: string | null; subcategoryId: string | null },
  categoriesById: ReadonlyMap<string, Category>,
): string | null {
  const main = choice.categoryId ? categoriesById.get(choice.categoryId) : undefined;
  if (!main) return null;
  const sub = choice.subcategoryId ? categoriesById.get(choice.subcategoryId) : undefined;
  return sub ? `${main.name} › ${sub.name}` : main.name;
}
