/**
 * Deterministic natural-language entry parser: "tea 15, bus 20, snacks 35" or "₹40 lunch and
 * ₹15 tea yesterday" → one draft per purchase. No network, no API key, no learning: the same
 * text on the same day always gives the same drafts.
 *
 * It only ever produces drafts. Nothing is saved until the user reviews and confirms them, and
 * anything uncertain is flagged in `issues` rather than guessed silently.
 *
 * How text is read:
 *  1. Dates are found first and swapped for markers, so "24/10" is never read as an amount.
 *  2. Commas, semicolons, full stops and new lines separate entries. "and", "&", "plus" and
 *     "then" do too, unless the left side has no amount ("bread and butter 40" is one entry).
 *  3. Within a part, several amounts mean several entries ("tea 15 bus 20", as speech often
 *     arrives). If splitting would leave an entry with no words ("2 samosa 30"), it stays one
 *     entry and the amount is flagged for the user to confirm.
 *  4. One date in the text applies to every entry. With several, an entry without its own date
 *     takes the nearest earlier one, otherwise the next one.
 *  5. The Hindi day words "aaj", "kal" and "parso" count as dates. "kal" and "parso" can also
 *     mean tomorrow and the day after, but only things that have happened are recorded here, so
 *     they read as past days and `dateWord` lets the review say which day that was.
 *  6. Speech recognition can write a Hindi day word as something else ("kal" as "call"). Only in a
 *     voice entry, and only where the word can't mean what it says (see `respellHeardDayWords`),
 *     it's read as the day word. The review says so, and the date stays editable like every other.
 *     Typed text is never changed: there, "call" is a word. Devanagari कल, आज and परसों have one
 *     meaning as dates, so they count everywhere.
 */
import type { Paise } from "./money";
import { type DayWord, HEARD_PATTERN, extractDates, respellHeardDayWords } from "./parse-dates";
import {
  type Token,
  STRONG_BREAK,
  WEAK_BREAK,
  count,
  markCurrency,
  splitPart,
  tokenize,
} from "./parse-tokens";
import type { LocalDate } from "./time";

export type { DayWord };

export type ParseIssue =
  /** No amount found: the user must enter one. */
  | "missing_amount"
  /** A number was found but can't be an amount (zero, too large, 3+ decimals). */
  | "invalid_amount"
  /** Several numbers and no way to tell which is the price. */
  | "ambiguous_amount"
  /** One price with an item on each side ("tea 15 bus"): one purchase, or a missing amount? */
  | "unclear_item"
  /** Written in another currency; amounts here are always in the user's currency. */
  | "other_currency"
  /** Dated in the future: only things that have happened are recorded. */
  | "future_date"
  /** Reads like a refund or transfer, which need the full form's extra details. */
  | "needs_full_form";

export interface ParsedEntry {
  /** The words this entry came from, shown beside the draft. */
  source: string;
  type: "expense" | "income";
  description: string | null;
  merchant: string | null;
  amountPaise: Paise | null;
  date: LocalDate;
  /** True when the date came from the text rather than defaulting to today. */
  dateFromText: boolean;
  /**
   * The word a date came from, when that's a default reading the user should see: "kal", "parso",
   * or what speech wrote in place of a day word ("call"). `dateMeaning` says which day word it is.
   */
  dateWord: string | null;
  dateMeaning: DayWord | null;
  issues: ParseIssue[];
}

export const MAX_PARSE_LENGTH = 2_000;

// --- Meaning -----------------------------------------------------------------------------------

/** Words that carry no meaning of their own at the edges of a description. */
const FILLERS = new Set(
  "i we me my a an the spent spend paid pay bought buy got had for on of to worth rs rupee rupees bucks inr".split(
    " ",
  ),
);
/** Words after a price that only describe it: "tea 15 at canteen", "lunch 40 with friends". */
const DETAIL_START = new Set("at in from for to with near on by via only each".split(" "));
const INCOME_START = /^(?:received|recieved|earned|salary|stipend|allowance|pocket\s+money)\b/i;
const GOT_FROM = /^got\b.*\bfrom\b/i;
const FULL_FORM_START = /^(?:refund(?:ed)?|transfer(?:red)?|moved|withdrew|withdrawn)\b/i;

function trimFillers(words: string[]): string[] {
  let start = 0;
  let end = words.length;
  while (start < end && FILLERS.has(words[start]!.toLowerCase())) start++;
  while (end > start && FILLERS.has(words[end - 1]!.toLowerCase())) end--;
  return words.slice(start, end);
}

/** "tea 15 bus": items on both sides of one price could be one purchase or a forgotten amount. */
function isUnclearItem(tokens: readonly Token[]): boolean {
  const index = tokens.findIndex((t) => t.kind === "amount");
  if (index === -1) return false;
  const wordsIn = (part: readonly Token[]) =>
    part.filter((t) => t.kind === "word").map((t) => t.raw);
  const after = wordsIn(tokens.slice(index + 1));
  return (
    after.length > 0 &&
    !DETAIL_START.has(after[0]!.toLowerCase()) &&
    trimFillers(after).length > 0 &&
    trimFillers(wordsIn(tokens.slice(0, index))).length > 0
  );
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function readWords(words: string[], income: boolean) {
  // "tea at canteen" → merchant; for income, "from dad" is who it came from.
  const lower = words.map((w) => w.toLowerCase());
  const at = lower.indexOf(income ? "from" : "at", 1);
  const atStart = income && lower[0] === "from" ? 0 : at;
  let merchant: string | null = null;
  let rest = words;
  if (atStart !== -1) {
    merchant = words.slice(atStart + 1).join(" ") || null;
    rest = words.slice(0, atStart);
  }
  const kept = income ? rest.filter((w) => !/^(?:received|recieved|earned)$/i.test(w)) : rest;
  const description = trimFillers(kept).join(" ");
  return {
    description: description ? sentenceCase(description) : null,
    merchant: merchant ? sentenceCase(merchant) : null,
  };
}

interface Draft {
  tokens: Token[];
  ambiguous: boolean;
}

interface FoundDate {
  date: LocalDate;
  raw: string;
}

function dateWordOf(raw: string): Pick<ParsedEntry, "dateWord" | "dateMeaning"> {
  const heard = new RegExp(`^${HEARD_PATTERN}`, "i").exec(raw);
  if (heard) return { dateWord: heard[2]!, dateMeaning: heard[1] as DayWord };
  if (/^(?:kal\b|कल)/i.test(raw)) return { dateWord: "kal", dateMeaning: "kal" };
  if (/^(?:parson?\b|परस)/i.test(raw)) return { dateWord: "parso", dateMeaning: "parso" };
  return { dateWord: null, dateMeaning: null };
}

function toEntry(draft: Draft, found: FoundDate | null, today: LocalDate): ParsedEntry {
  const { tokens, ambiguous } = draft;
  const words = tokens.filter((t) => t.kind === "word").map((t) => t.raw);
  const text = words.join(" ");
  const amount = tokens.find((t) => t.kind === "amount");
  const issues: ParseIssue[] = [];

  const income = INCOME_START.test(text) || GOT_FROM.test(text);
  if (FULL_FORM_START.test(text)) issues.push("needs_full_form");
  if (!amount) issues.push("missing_amount");
  else if (amount.kind === "amount" && amount.paise === null) issues.push("invalid_amount");
  if (ambiguous) issues.push("ambiguous_amount");
  else if (!income && isUnclearItem(tokens)) issues.push("unclear_item");
  if (amount?.kind === "amount" && amount.foreign) issues.push("other_currency");
  const resolved = found?.date ?? today;
  if (resolved > today) issues.push("future_date");

  return {
    source: tokens.map((t) => t.raw).join(" "),
    type: income ? "income" : "expense",
    ...readWords(words, income),
    amountPaise: amount?.kind === "amount" ? amount.paise : null,
    date: resolved,
    dateFromText: found !== null,
    ...(found ? dateWordOf(found.raw) : { dateWord: null, dateMeaning: null }),
    issues,
  };
}

/** Each entry's date: its own, else the nearest earlier one, else the next one. */
function resolveDates(drafts: readonly Draft[], found: readonly FoundDate[]) {
  const own = drafts.map((d) => {
    const token = d.tokens.findLast((t) => t.kind === "date");
    return token?.kind === "date" ? found[token.index]! : null;
  });
  return own.map((date, i) => {
    if (date) return date;
    for (let j = i - 1; j >= 0; j--) if (own[j]) return own[j]!;
    for (let j = i + 1; j < own.length; j++) if (own[j]) return own[j]!;
    return null;
  });
}

/**
 * Parses free text into drafts. `today` is the user's local date. `spoken` marks a transcript from
 * voice entry, the only text where "call" can mean "kal".
 */
export function parseEntries(
  input: string,
  today: LocalDate,
  options: { spoken?: boolean } = {},
): ParsedEntry[] {
  const text = input.normalize("NFKC").slice(0, MAX_PARSE_LENGTH).trim();
  if (!text) return [];
  // Times of day aren't amounts ("tea 15 at 5pm").
  const withoutTimes = markCurrency(
    text.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " "),
  );
  const { text: marked, found } = extractDates(
    options.spoken ? respellHeardDayWords(withoutTimes, today) : withoutTimes,
    today,
  );

  const drafts: Draft[] = [];
  for (const segment of marked.split(STRONG_BREAK)) {
    if (!segment?.trim()) continue;
    const parts = segment.split(WEAK_BREAK).map((part) => tokenize(part, found));
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const next = parts[i + 1];
      // "bread and butter 40": a left side with no amount belongs to the right side.
      if (count(part, "amount") === 0 && count(part, "word") > 0 && next && count(next, "amount")) {
        parts[i + 1] = [...part, { kind: "word", raw: "and" }, ...next];
        continue;
      }
      // "tea 15, bus 20, yesterday": a lone date belongs to the entry before it.
      if (part.every((t) => t.kind === "date")) {
        const last = drafts.at(-1);
        if (last) last.tokens.push(...part);
        else if (next) parts[i + 1] = [...part, ...next];
        continue;
      }
      drafts.push(...splitPart(part));
    }
  }

  const dates = resolveDates(drafts, found);
  return drafts.map((draft, i) => toEntry(draft, dates[i]!, today));
}
