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
 */
import { MAX_AMOUNT_PAISE, type Paise, multiplyPaise, parseAmountInput } from "./money";
import { type LocalDate, addDays, isLocalDate, parseLocalDate, weekdayOf } from "./time";

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
  /** "kal" or "parso" when the date came from one: a default reading the user should see. */
  dateWord: "kal" | "parso" | null;
  issues: ParseIssue[];
}

export const MAX_PARSE_LENGTH = 2_000;

// --- Dates -----------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS).join("|");
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
/** Short names need "on", "this" or "last" in front: "sun glasses 200" isn't a date. */
const SHORT_WEEKDAYS: Record<string, string> = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  tues: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  thur: "thursday",
  thurs: "thursday",
  fri: "friday",
  sat: "saturday",
};
const SMALL_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

/** A real calendar date, or null ("31/02" is not a date). */
function checkedDate(year: number, month: number, day: number): LocalDate | null {
  const text = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isLocalDate(text) ? text : null;
}

/** A day and month with no year: this year, or last year if that would be in the future. */
function nearestPast(month: number, day: number, today: LocalDate): LocalDate | null {
  const year = parseLocalDate(today).year;
  const thisYear = checkedDate(year, month, day);
  if (thisYear && thisYear <= today) return thisYear;
  return checkedDate(year - 1, month, day) ?? thisYear;
}

function fullYear(text: string): number {
  return text.length === 2 ? 2000 + Number(text) : Number(text);
}

function recentWeekday(name: string, today: LocalDate, strictlyBefore: boolean): LocalDate {
  const back = (weekdayOf(today) - WEEKDAYS.indexOf(name) + 7) % 7;
  return addDays(today, back === 0 && strictlyBefore ? -7 : -back);
}

type DateRule = [RegExp, (m: RegExpExecArray, today: LocalDate) => LocalDate | null];

/** The rest of a Hindi day phrase, so "kal raat ka dinner 200" leaves just "dinner". */
const HINDI_DAY_TAIL = "(?:\\s+(?:subah|dopahar|shaam|sham|raat))?(?:\\s+(?:ka|ki|ke))?\\b";

// Longest and most specific first; each match is replaced before the next rule runs.
const DATE_RULES: DateRule[] = [
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => checkedDate(Number(m[1]), Number(m[2]), Number(m[3]))],
  [
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})\b/g,
    (m) => checkedDate(fullYear(m[3]!), Number(m[2]), Number(m[1])),
  ],
  [
    // An ordinal is certainly the day: "tea 15 oct 24th" is the 24th, not the 15th.
    new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)\\b(?:,?\\s+(\\d{4}))?`, "gi"),
    (m, today) => {
      const month = MONTHS[m[1]!.toLowerCase()]!;
      return m[3]
        ? checkedDate(Number(m[3]), month, Number(m[2]))
        : nearestPast(month, Number(m[2]), today);
    },
  ],
  [
    /\b(\d{1,2})\/(\d{1,2})\b/g,
    (m, today) => {
      const [day, month] = [Number(m[1]), Number(m[2])];
      return month >= 1 && month <= 12 ? nearestPast(month, day, today) : null;
    },
  ],
  [
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+(${MONTH_NAMES})\\b(?:,?\\s+(\\d{4}))?`,
      "gi",
    ),
    (m, today) => {
      const month = MONTHS[m[2]!.toLowerCase()]!;
      return m[3]
        ? checkedDate(Number(m[3]), month, Number(m[1]))
        : nearestPast(month, Number(m[1]), today);
    },
  ],
  [
    new RegExp(
      `\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?(?![\\d.,]*\\s*(?:rs|₹))`,
      "gi",
    ),
    (m, today) => {
      const month = MONTHS[m[1]!.toLowerCase()]!;
      return m[3]
        ? checkedDate(Number(m[3]), month, Number(m[2]))
        : nearestPast(month, Number(m[2]), today);
    },
  ],
  [/\b(?:the\s+)?day\s+before\s+yesterday\b/gi, (_, today) => addDays(today, -2)],
  [
    /\b(\d{1,3}|a|an|one|two|three|four|five|six|seven)\s+days?\s+ago\b/gi,
    (m, today) => addDays(today, -(SMALL_NUMBERS[m[1]!.toLowerCase()] ?? Number(m[1]))),
  ],
  [/\b(?:a|one)\s+week\s+ago\b/gi, (_, today) => addDays(today, -7)],
  [/\b(?:yesterday|last\s+night)\b/gi, (_, today) => addDays(today, -1)],
  [/\b(?:today|tonight|this\s+(?:morning|afternoon|evening))\b/gi, (_, today) => today],
  [/\btomorrow\b/gi, (_, today) => addDays(today, 1)],
  [new RegExp(`\\bparson?\\b${HINDI_DAY_TAIL}`, "gi"), (_, today) => addDays(today, -2)],
  [new RegExp(`\\bkal\\b${HINDI_DAY_TAIL}`, "gi"), (_, today) => addDays(today, -1)],
  [new RegExp(`\\baaj\\b${HINDI_DAY_TAIL}`, "gi"), (_, today) => today],
  [
    new RegExp(`\\blast\\s+(${WEEKDAYS.join("|")})\\b`, "gi"),
    (m, today) => recentWeekday(m[1]!.toLowerCase(), today, true),
  ],
  [
    new RegExp(`\\b(?:(?:on|this)\\s+)?(${WEEKDAYS.join("|")})\\b`, "gi"),
    (m, today) => recentWeekday(m[1]!.toLowerCase(), today, false),
  ],
  [
    new RegExp(`\\b(on|this|last)\\s+(${Object.keys(SHORT_WEEKDAYS).join("|")})\\b`, "gi"),
    (m, today) =>
      recentWeekday(SHORT_WEEKDAYS[m[2]!.toLowerCase()]!, today, m[1]!.toLowerCase() === "last"),
  ],
];

const marker = (index: number) => ` ${index} `;
const MARKER = /^(\d+)$/;

function extractDates(text: string, today: LocalDate) {
  const found: { date: LocalDate; raw: string }[] = [];
  let out = text;
  for (const [pattern, resolve] of DATE_RULES) {
    out = out.replace(pattern, (...args) => {
      const groups = args.slice(0, -2) as string[];
      const match = Object.assign(groups, { index: 0, input: out }) as unknown as RegExpExecArray;
      const date = resolve(match, today);
      if (!date) return args[0] as string;
      found.push({ date, raw: args[0] as string });
      return marker(found.length - 1);
    });
  }
  return { text: out, found };
}

// --- Numbers ---------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const isNumberWord = (word: string) =>
  word in UNITS || word in TENS || word === "hundred" || word === "thousand";

/**
 * "fifteen" → 15, "two hundred fifty" → 250, and the Indian spoken form "one fifty" → 150.
 * Returns the whole-rupee value and how many words it used.
 */
function readNumberWords(words: readonly string[], start: number) {
  let total = 0;
  let current = 0;
  let used = 0;
  for (let i = start; i < words.length; i++) {
    const word = words[i]!;
    if (word === "and" && used > 0 && isNumberWord(words[i + 1] ?? "")) {
      used++;
      continue;
    }
    if (!isNumberWord(word)) break;
    if (word === "hundred") current = (current || 1) * 100;
    else if (word === "thousand") {
      total += (current || 1) * 1_000;
      current = 0;
    } else if (word in TENS && current > 0 && current < 10) current = current * 100 + TENS[word]!;
    else current += word in TENS ? TENS[word]! : UNITS[word]!;
    used++;
  }
  return { value: total + current, used };
}

// --- Tokens --------------------------------------------------------------------------------------

type Token =
  | { kind: "word"; raw: string }
  | { kind: "date"; raw: string; index: number }
  | {
      kind: "amount";
      raw: string;
      paise: Paise | null;
      /** Written with a currency mark, so it's certainly a price. */
      marked: boolean;
      foreign: boolean;
    };

const AMOUNT_TOKEN = /^([₹¤]?)(\d[\d,]*(?:\.\d*)?)(k?)([₹¤]?)$/i;

/** Currency words and symbols become one mark attached to the number. */
function markCurrency(text: string): string {
  return text
    .replace(/(?:₹|\brs\.?|\binr)\s*(?=\d)/gi, "₹")
    .replace(/(\d)\s*(?:₹|\/-|rs\b\.?|inr\b|rupees?\b|bucks?\b)/gi, "$1₹")
    .replace(/[$€£]\s*(?=\d)/g, "¤")
    .replace(/(\d)\s*(?:usd|dollars?|eur|euros?|gbp|pounds?)\b/gi, "$1¤");
}

function toAmount(raw: string, match: RegExpExecArray): Token {
  const prefix = match[1]!;
  const suffix = match[4]!;
  const parsed = parseAmountInput(match[2]!);
  let paise: Paise | null = parsed.ok ? parsed.paise : null;
  if (paise !== null && match[3]) {
    const scaled = paise * 1_000;
    paise = scaled <= MAX_AMOUNT_PAISE ? multiplyPaise(paise, 1_000) : null;
  }
  return {
    kind: "amount",
    raw,
    paise,
    marked: Boolean(prefix || suffix || match[3]),
    foreign: prefix === "¤" || suffix === "¤",
  };
}

function tokenize(text: string, dates: readonly { raw: string }[]): Token[] {
  const pieces = text.split(/\s+/).filter(Boolean);
  const hasDigits = pieces.some((p) => AMOUNT_TOKEN.test(p));
  const lower = pieces.map((p) => p.toLowerCase().replace(/[.!?]+$/, ""));
  const tokens: Token[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    const date = MARKER.exec(piece);
    if (date) {
      tokens.push({ kind: "date", raw: dates[Number(date[1])]!.raw, index: Number(date[1]) });
      continue;
    }
    const amount = AMOUNT_TOKEN.exec(piece);
    if (amount) {
      tokens.push(toAmount(piece.replace(/[₹¤]/g, ""), amount));
      continue;
    }
    // Spoken numbers count only when the text has no digits ("two samosa 30" has a quantity).
    if (!hasDigits && isNumberWord(lower[i]!)) {
      const { value, used } = readNumberWords(lower, i);
      tokens.push({
        kind: "amount",
        raw: pieces.slice(i, i + used).join(" "),
        paise: value > 0 ? multiplyPaise(value, 100) : null,
        marked: false,
        foreign: false,
      });
      i += used - 1;
      continue;
    }
    const word = piece.replace(/[.!?]+$/, "");
    if (word) tokens.push({ kind: "word", raw: word });
  }
  return tokens;
}

const count = (tokens: readonly Token[], kind: Token["kind"]) =>
  tokens.filter((t) => t.kind === kind).length;

// --- Splitting ---------------------------------------------------------------------------------

/** Commas inside numbers ("1,250") and dots in decimals don't separate entries. */
const STRONG_BREAK = /(?:,(?!\d)|(?<!\d),|[;\n]+|\.(?=\s|$))/;
const WEAK_BREAK = /\s+(?:and|plus|then|also|&)\s+/i;

function splitPart(tokens: readonly Token[]): { tokens: Token[]; ambiguous: boolean }[] {
  let amounts = tokens.filter((t) => t.kind === "amount");
  // Currency marks settle it: "2 samosa ₹30" is one price and a quantity.
  const marked = amounts.filter((t) => t.kind === "amount" && t.marked);
  let working = [...tokens];
  if (marked.length >= 1 && marked.length < amounts.length) {
    working = tokens.map((t) =>
      t.kind === "amount" && !t.marked ? { kind: "word", raw: t.raw } : t,
    );
    amounts = marked;
  }
  if (amounts.length <= 1) return [{ tokens: working, ambiguous: false }];

  const firstContent = working.find((t) => t.kind !== "date");
  const amountFirst = firstContent?.kind === "amount";
  const chunks: Token[][] = [];
  let current: Token[] = [];
  for (const token of working) {
    if (amountFirst && token.kind === "amount" && count(current, "amount") > 0) {
      chunks.push(current);
      current = [];
    }
    current.push(token);
    if (!amountFirst && token.kind === "amount") {
      chunks.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    if (!amountFirst && chunks.length > 0) chunks[chunks.length - 1]!.push(...current);
    else chunks.push(current);
  }

  if (chunks.every((c) => count(c, "word") > 0)) {
    return chunks.map((c) => ({ tokens: c, ambiguous: false }));
  }
  // Splitting would leave a bare number: keep one entry, last number as the price, and ask.
  const lastAmount = working.findLastIndex((t) => t.kind === "amount");
  return [
    {
      tokens: working.map((t, i) =>
        t.kind === "amount" && i !== lastAmount ? { kind: "word", raw: t.raw } : t,
      ),
      ambiguous: true,
    },
  ];
}

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

function dateWordOf(raw: string): ParsedEntry["dateWord"] {
  if (/^kal\b/i.test(raw)) return "kal";
  return /^parson?\b/i.test(raw) ? "parso" : null;
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
    dateWord: found ? dateWordOf(found.raw) : null,
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

/** Parses free text into drafts. `today` is the user's local date. */
export function parseEntries(input: string, today: LocalDate): ParsedEntry[] {
  const text = input.normalize("NFKC").slice(0, MAX_PARSE_LENGTH).trim();
  if (!text) return [];
  // Times of day aren't amounts ("tea 15 at 5pm").
  const withoutTimes = markCurrency(
    text.replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, " "),
  );
  const { text: marked, found } = extractDates(withoutTimes, today);

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
