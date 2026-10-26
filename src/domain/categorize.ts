/**
 * Category hierarchy helpers and the deterministic category suggestion service.
 *
 * Suggestions never call an external service and never commit anything: entry flows show the
 * suggestion as a preselected, clearly labelled choice the user can change. The same inputs
 * always give the same suggestion. Order of precedence:
 *
 *  1. The user's own rules ("chai" → Food & Drinks › Tea): highest priority first, then the
 *     longest match, then rule id.
 *  2. History, exact: what the user chose before for the same description/merchant (most often
 *     chosen; ties → most recent, then id).
 *  3. History, similar: earlier entries sharing a meaningful word ("bus home" ~ "bus to college").
 *  4. Built-in keywords for the default hierarchy ("bus" → Transport › Bus), matched by category
 *     name, so they follow the user's categories rather than inventing any.
 *
 * Archived categories are never suggested; merged ones resolve to where their history moved.
 */
import type { Category, CategoryKind, CategoryRule, Transaction } from "./schemas";
import { isActive, occurredAtMs } from "./ledger";

export interface CategoryChoice {
  categoryId: string;
  subcategoryId: string | null;
}

export type SuggestionSource = "rule" | "history" | "similar" | "keyword";

export interface CategorySuggestion extends CategoryChoice {
  source: SuggestionSource;
  /** Plain-language reason shown with the suggestion, e.g. "Your rule: description has “chai”". */
  reason: string;
  ruleId?: string;
  /** Number of earlier entries behind a history-based suggestion. */
  evidence?: number;
}

export interface SuggestionInput {
  description?: string | null;
  merchant?: string | null;
  kind?: CategoryKind;
}

export interface SuggestionContext {
  categories: readonly Category[];
  rules?: readonly CategoryRule[];
  /** The user's earlier transactions (any order); only categorised, active ones are used. */
  history?: readonly Transaction[];
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
function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

// --- Hierarchy ------------------------------------------------------------------------------

export function isCategoryActive(category: Category): boolean {
  return category.archivedAt === null && category.mergedIntoId === null;
}

export interface CategoryNode {
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
export function resolveCategory(
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

// --- Built-in keywords ----------------------------------------------------------------------

/** keyword (normalized, may be a phrase) → [main category name, subcategory name | null]. */
const KEYWORDS: Record<CategoryKind, ReadonlyArray<[string, string, string | null]>> = {
  expense: [
    ["tea", "Food & Drinks", "Tea"],
    ["chai", "Food & Drinks", "Tea"],
    ["coffee", "Food & Drinks", "Coffee"],
    ["snack", "Food & Drinks", "Snacks"],
    ["snacks", "Food & Drinks", "Snacks"],
    ["samosa", "Food & Drinks", "Snacks"],
    ["chips", "Food & Drinks", "Snacks"],
    ["biscuit", "Food & Drinks", "Snacks"],
    ["biscuits", "Food & Drinks", "Snacks"],
    ["breakfast", "Food & Drinks", "Breakfast"],
    ["lunch", "Food & Drinks", "Lunch"],
    ["dinner", "Food & Drinks", "Dinner"],
    ["groceries", "Food & Drinks", "Groceries"],
    ["grocery", "Food & Drinks", "Groceries"],
    ["vegetables", "Food & Drinks", "Groceries"],
    ["milk", "Food & Drinks", "Groceries"],
    ["cafe", "Food & Drinks", "Cafe"],
    ["swiggy", "Food & Drinks", "Delivery"],
    ["zomato", "Food & Drinks", "Delivery"],
    ["delivery", "Food & Drinks", "Delivery"],
    ["fees", "College", "Fees"],
    ["fee", "College", "Fees"],
    ["book", "College", "Books"],
    ["books", "College", "Books"],
    ["stationery", "College", "Stationery"],
    ["pen", "College", "Stationery"],
    ["notebook", "College", "Stationery"],
    ["printing", "College", "Printing"],
    ["print", "College", "Printing"],
    ["printout", "College", "Printing"],
    ["xerox", "College", "Printing"],
    ["photocopy", "College", "Printing"],
    ["assignment", "College", "Assignments"],
    ["project", "College", "Project components"],
    ["arduino", "College", "Project components"],
    ["fest", "College", "Events"],
    ["event", "College", "Events"],
    ["bus", "Transport", "Bus"],
    ["train", "Transport", "Train"],
    ["metro", "Transport", "Train"],
    ["auto", "Transport", "Auto"],
    ["rickshaw", "Transport", "Auto"],
    ["cab", "Transport", "Cab"],
    ["uber", "Transport", "Cab"],
    ["ola", "Transport", "Cab"],
    ["rapido", "Transport", "Cab"],
    ["petrol", "Transport", "Fuel"],
    ["fuel", "Transport", "Fuel"],
    ["parking", "Transport", "Parking"],
    ["clothes", "Personal", "Clothes"],
    ["shirt", "Personal", "Clothes"],
    ["haircut", "Personal", "Grooming"],
    ["salon", "Personal", "Grooming"],
    ["shampoo", "Personal", "Personal care"],
    ["soap", "Personal", "Personal care"],
    ["shopping", "Personal", "Shopping"],
    ["movie", "Entertainment", "Movies"],
    ["movies", "Entertainment", "Movies"],
    ["cinema", "Entertainment", "Movies"],
    ["game", "Entertainment", "Games"],
    ["games", "Entertainment", "Games"],
    ["outing", "Entertainment", "Outings"],
    ["trip", "Entertainment", "Outings"],
    ["hobby", "Entertainment", "Hobbies"],
    ["recharge", "Bills & Subscriptions", "Mobile recharge"],
    ["mobile data", "Bills & Subscriptions", "Mobile data"],
    ["data pack", "Bills & Subscriptions", "Mobile data"],
    ["netflix", "Bills & Subscriptions", "Subscriptions"],
    ["spotify", "Bills & Subscriptions", "Subscriptions"],
    ["subscription", "Bills & Subscriptions", "Subscriptions"],
    ["medicine", "Health & Fitness", "Medicines"],
    ["medicines", "Health & Fitness", "Medicines"],
    ["pharmacy", "Health & Fitness", "Medicines"],
    ["doctor", "Health & Fitness", "Appointments"],
    ["gym", "Health & Fitness", "Gym"],
  ],
  income: [
    ["allowance", "Allowance", null],
    ["pocket money", "Allowance", null],
    ["salary", "Part-time work", null],
    ["stipend", "Part-time work", null],
    ["freelance", "Part-time work", null],
    ["scholarship", "Scholarship", null],
    ["gift", "Gifts", null],
    ["birthday", "Gifts", null],
  ],
};

function findByName(
  categories: readonly Category[],
  kind: CategoryKind,
  main: string,
  sub: string | null,
) {
  const mainCat = categories.find(
    (c) =>
      c.kind === kind &&
      c.parentId === null &&
      isCategoryActive(c) &&
      c.name.toLowerCase() === main.toLowerCase(),
  );
  if (!mainCat) return null;
  const subCat = sub
    ? categories.find(
        (c) =>
          c.parentId === mainCat.id &&
          isCategoryActive(c) &&
          c.name.toLowerCase() === sub.toLowerCase(),
      )
    : undefined;
  return { categoryId: mainCat.id, subcategoryId: subCat?.id ?? null };
}

// --- Suggestion -----------------------------------------------------------------------------

export function ruleMatches(rule: CategoryRule, input: SuggestionInput): boolean {
  const field = rule.matchField === "merchant" ? input.merchant : input.description;
  return containsPhrase(normalizeText(field), normalizeText(rule.matchText));
}

interface Tally {
  choice: CategoryChoice;
  count: number;
  latestMs: number;
  latestId: string;
}

function pickTally(tallies: Map<string, Tally>): Tally | null {
  let best: Tally | null = null;
  for (const t of tallies.values()) {
    if (
      !best ||
      t.count > best.count ||
      (t.count === best.count &&
        (t.latestMs > best.latestMs ||
          (t.latestMs === best.latestMs && t.latestId > best.latestId)))
    ) {
      best = t;
    }
  }
  return best;
}

function addTally(tallies: Map<string, Tally>, choice: CategoryChoice, tx: Transaction) {
  const key = `${choice.categoryId}/${choice.subcategoryId ?? ""}`;
  const ms = occurredAtMs(tx);
  const existing = tallies.get(key);
  if (!existing) {
    tallies.set(key, { choice, count: 1, latestMs: ms, latestId: tx.id });
    return;
  }
  existing.count += 1;
  if (ms > existing.latestMs || (ms === existing.latestMs && tx.id > existing.latestId)) {
    existing.latestMs = ms;
    existing.latestId = tx.id;
  }
}

const quoted = (text: string) => `“${text}”`;
const times = (n: number) => (n === 1 ? "once" : `${n} times`);

/**
 * Suggests a category for a description/merchant, or null (the entry stays Uncategorized and
 * shows up in the queue). See the module comment for the order of precedence.
 */
export function suggestCategory(
  input: SuggestionInput,
  context: SuggestionContext,
): CategorySuggestion | null {
  const kind = input.kind ?? "expense";
  const byId = new Map(context.categories.map((c) => [c.id, c]));
  const description = normalizeText(input.description);
  const merchant = normalizeText(input.merchant);
  if (!description && !merchant) return null;

  // 1. Rules
  const rules = [...(context.rules ?? [])].sort(
    (a, b) =>
      b.priority - a.priority ||
      normalizeText(b.matchText).length - normalizeText(a.matchText).length ||
      a.id.localeCompare(b.id),
  );
  for (const rule of rules) {
    if (!ruleMatches(rule, input)) continue;
    const choice = resolveCategoryChoice(rule, byId, kind);
    if (!choice) continue;
    return {
      ...choice,
      source: "rule",
      ruleId: rule.id,
      reason: `Your rule: ${rule.matchField} has ${quoted(rule.matchText.trim())}`,
    };
  }

  // 2–3. History
  const txType = kind === "income" ? "income" : "expense";
  const history = (context.history ?? []).filter(
    (tx): tx is Extract<Transaction, { type: "income" | "expense" }> =>
      tx.type === txType && isActive(tx) && tx.categoryId !== null,
  );
  const exact = new Map<string, Tally>();
  const similar = new Map<string, Tally>();
  const inputTokens = new Set([...significantTokens(description), ...significantTokens(merchant)]);
  for (const tx of history) {
    const choice = resolveCategoryChoice(tx, byId, kind);
    if (!choice) continue;
    const txDescription = normalizeText(tx.description);
    const txMerchant = normalizeText(tx.merchant);
    const isExact =
      (description !== "" && (txDescription === description || txMerchant === description)) ||
      (merchant !== "" && (txMerchant === merchant || txDescription === merchant));
    if (isExact) {
      addTally(exact, choice, tx);
    } else if (
      [...significantTokens(txDescription), ...significantTokens(txMerchant)].some((t) =>
        inputTokens.has(t),
      )
    ) {
      addTally(similar, choice, tx);
    }
  }
  const label = description || merchant;
  const exactPick = pickTally(exact);
  if (exactPick) {
    return {
      ...exactPick.choice,
      source: "history",
      evidence: exactPick.count,
      reason: `You chose this ${times(exactPick.count)} for ${quoted(label)}`,
    };
  }
  const similarPick = pickTally(similar);
  if (similarPick) {
    return {
      ...similarPick.choice,
      source: "similar",
      evidence: similarPick.count,
      reason: `Like ${similarPick.count === 1 ? "an earlier entry" : `${similarPick.count} earlier entries`} with similar words`,
    };
  }

  // 4. Built-in keywords: the earliest keyword in the text wins ("tea and samosa" → Tea).
  let best: { position: number; length: number; keyword: string; choice: CategoryChoice } | null =
    null;
  for (const [keyword, main, sub] of KEYWORDS[kind]) {
    for (const text of [description, merchant]) {
      if (!containsPhrase(text, keyword)) continue;
      const position = ` ${text} `.indexOf(` ${keyword} `);
      const choice = findByName(context.categories, kind, main, sub);
      if (!choice) continue;
      if (
        !best ||
        position < best.position ||
        (position === best.position && keyword.length > best.length)
      ) {
        best = { position, length: keyword.length, keyword, choice };
      }
    }
  }
  if (best) {
    return {
      ...best.choice,
      source: "keyword",
      reason: `Matched the word ${quoted(best.keyword)}`,
    };
  }
  return null;
}

/**
 * Expenses waiting for a category (the Uncategorized queue), newest first. Refunds aren't listed:
 * they inherit their expense's category, so categorising the expense fixes both.
 */
export function uncategorizedQueue(
  ledger: readonly Transaction[],
): Extract<Transaction, { type: "expense" }>[] {
  return ledger
    .filter(
      (tx): tx is Extract<Transaction, { type: "expense" }> =>
        tx.type === "expense" && isActive(tx) && tx.categoryId === null,
    )
    .sort((a, b) => occurredAtMs(b) - occurredAtMs(a) || b.id.localeCompare(a.id));
}
