/**
 * Review drafts for typed and voice entry. The parser's output becomes editable drafts with a
 * suggested category; this module decides what still needs the user's attention and turns the
 * confirmed list into one atomic batch command. Pure: the review screen only renders the result.
 */
import {
  type Category,
  type CategoryChoice,
  type CategoryRule,
  type CurrencyCode,
  type LocalDate,
  type ParseIssue,
  type ParsedEntry,
  type Transaction,
  instantFromLocalDateTime,
  isLocalDate,
  parseAmountInput,
  suggestCategory,
} from "@/domain";
import { paiseToInput } from "@/lib/format";
import type { LedgerCommand } from "@/lib/ledger/commands";

export type SuggestionContext = {
  categories: readonly Category[];
  rules: readonly CategoryRule[];
  history: readonly Transaction[];
};

export type ReviewDraft = {
  /** Client-generated transaction id, fixed for the draft's life so retries can't duplicate. */
  id: string;
  /** The words it came from. */
  source: string;
  type: "expense" | "income";
  description: string;
  merchant: string | null;
  amountText: string;
  date: LocalDate;
  /** Set while the date is the parser's reading of "kal" or "parso"; editing the date clears it. */
  dateWord: ParsedEntry["dateWord"];
  category: CategoryChoice | null;
  /** Why the category was suggested; null once the user picks one, or when there's none. */
  suggestionReason: string | null;
  categoryPicked: boolean;
  /** Parser doubts still open. Editing the amount or date, or confirming, clears them. */
  issues: ParseIssue[];
};

function suggestionFor(
  draft: Pick<ReviewDraft, "description" | "merchant" | "type">,
  context: SuggestionContext,
) {
  return suggestCategory(
    { description: draft.description, merchant: draft.merchant, kind: draft.type },
    context,
  );
}

export function buildDrafts(
  entries: readonly ParsedEntry[],
  context: SuggestionContext,
  newId: () => string,
): ReviewDraft[] {
  return entries.map((entry) => {
    const base = {
      description: entry.description ?? "",
      merchant: entry.merchant,
      type: entry.type,
    };
    const suggestion = suggestionFor(base, context);
    return {
      ...base,
      id: newId(),
      source: entry.source,
      amountText: paiseToInput(entry.amountPaise),
      date: entry.date,
      dateWord: entry.dateWord,
      category: suggestion
        ? { categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId }
        : null,
      suggestionReason: suggestion?.reason ?? null,
      categoryPicked: false,
      issues: entry.issues,
    };
  });
}

/** Re-suggests after the words or type changed, unless the user chose a category themselves. */
export function refreshSuggestion(draft: ReviewDraft, context: SuggestionContext): ReviewDraft {
  if (draft.categoryPicked) return draft;
  const suggestion = suggestionFor(draft, context);
  return {
    ...draft,
    category: suggestion
      ? { categoryId: suggestion.categoryId, subcategoryId: suggestion.subcategoryId }
      : null,
    suggestionReason: suggestion?.reason ?? null,
  };
}

/** Editing one field answers the doubts that field raised. */
export function clearIssues(draft: ReviewDraft, answered: readonly ParseIssue[]): ReviewDraft {
  return { ...draft, issues: draft.issues.filter((i) => !answered.includes(i)) };
}

export const AMOUNT_ISSUES: readonly ParseIssue[] = [
  "missing_amount",
  "invalid_amount",
  "ambiguous_amount",
  "unclear_item",
  "other_currency",
];

export type DraftProblem = {
  message: string;
  /** Set when the user can accept the value as it stands. */
  confirm?: { label: string; clears: ParseIssue };
};

/** What stops this draft being saved. An uncategorized draft is allowed: it joins the queue. */
export function draftProblems(
  draft: ReviewDraft,
  today: LocalDate,
  money: (paise: number) => string,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const amount = parseAmountInput(draft.amountText);
  if (!amount.ok) {
    problems.push({
      message: draft.amountText.trim() === "" ? "Enter the amount." : amount.message,
    });
  } else if (draft.issues.includes("ambiguous_amount")) {
    problems.push({
      message: `There are several numbers here. Is ${money(amount.paise)} the price?`,
      confirm: { label: `Yes, ${money(amount.paise)}`, clears: "ambiguous_amount" },
    });
  } else if (draft.issues.includes("unclear_item")) {
    problems.push({
      message: `Is ${money(amount.paise)} for all of “${draft.description}”? If these are separate, go back and give each one its own amount.`,
      confirm: { label: `Yes, ${money(amount.paise)}`, clears: "unclear_item" },
    });
  } else if (draft.issues.includes("other_currency")) {
    problems.push({
      message: `This looks like another currency. Entries are saved as ${money(amount.paise)}, so check the amount.`,
      confirm: { label: `Keep ${money(amount.paise)}`, clears: "other_currency" },
    });
  }
  if (!isLocalDate(draft.date)) {
    problems.push({ message: "Choose a valid date." });
  } else if (draft.date > today) {
    problems.push({
      message: "That’s in the future. Record it once it happens, or plan it in Income & recurring.",
    });
  }
  if (draft.issues.includes("needs_full_form")) {
    problems.push({
      message:
        "This reads like a refund or transfer. Those need the full form, because a refund links to its purchase and a transfer needs two wallets. Remove it here and use the full form, or keep it as ordinary spending.",
      confirm: { label: "It’s ordinary spending", clears: "needs_full_form" },
    });
  }
  return problems;
}

/** Says which day "kal" or "parso" was read as. Not a blocker: past is the default reading. */
export function dateWordNote(
  draft: ReviewDraft,
  formatDate: (date: LocalDate) => string,
): string | null {
  if (!draft.dateWord) return null;
  const day = draft.dateWord === "kal" ? "yesterday" : "the day before yesterday";
  return `“${draft.dateWord}” is read as ${day}, ${formatDate(draft.date)}. Change the date if you meant another day.`;
}

/** Entries dated today use the time of confirming; earlier ones use midday, in the user's zone. */
export function draftOccurredAt(
  date: LocalDate,
  today: LocalDate,
  confirmedAt: string,
  timeZone: string,
): string {
  if (date === today) return confirmedAt;
  return new Date(instantFromLocalDateTime(date, "12:00", timeZone)).toISOString();
}

/** The confirmed drafts as one all-or-nothing batch. Call only when no draft has problems. */
export function commandFromDrafts(input: {
  drafts: readonly ReviewDraft[];
  opId: string;
  accountId: string;
  currency: CurrencyCode;
  source: "parsed_text" | "voice";
  today: LocalDate;
  confirmedAt: string;
  timeZone: string;
}): LedgerCommand {
  return {
    kind: "batch",
    opId: input.opId,
    drafts: input.drafts.map((draft) => {
      const amount = parseAmountInput(draft.amountText);
      if (!amount.ok) throw new Error("A draft with an invalid amount can't be saved");
      return {
        id: draft.id,
        type: draft.type,
        amountPaise: amount.paise,
        currency: input.currency,
        occurredAt: draftOccurredAt(draft.date, input.today, input.confirmedAt, input.timeZone),
        accountId: input.accountId,
        fromAccountId: null,
        toAccountId: null,
        refundOfId: null,
        categoryId: draft.category?.categoryId ?? null,
        subcategoryId: draft.category?.subcategoryId ?? null,
        description: draft.description.trim() || null,
        merchant: draft.merchant,
        note: null,
        tags: [],
        source: input.source,
      };
    }),
  };
}
