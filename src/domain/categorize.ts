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
import {
  type CategoryChoice,
  containsPhrase,
  normalizeText,
  resolveCategoryChoice,
  significantTokens,
} from "./category-tree";
import { findByName, KEYWORDS } from "./category-keywords";

type SuggestionSource = "rule" | "history" | "similar" | "keyword";

interface CategorySuggestion extends CategoryChoice {
  source: SuggestionSource;
  /** Plain-language reason shown with the suggestion, e.g. "Your rule: description has “chai”". */
  reason: string;
  ruleId?: string;
  /** Number of earlier entries behind a history-based suggestion. */
  evidence?: number;
}

interface SuggestionInput {
  description?: string | null;
  merchant?: string | null;
  kind?: CategoryKind;
}

interface SuggestionContext {
  categories: readonly Category[];
  rules?: readonly CategoryRule[];
  /** The user's earlier transactions (any order); only categorised, active ones are used. */
  history?: readonly Transaction[];
}

// --- Suggestion -----------------------------------------------------------------------------

function ruleMatches(rule: CategoryRule, input: SuggestionInput): boolean {
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
