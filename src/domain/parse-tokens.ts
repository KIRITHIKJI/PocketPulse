/** Tokens and entry splitting for the entry parser: words, date markers and amounts. */
import { MAX_AMOUNT_PAISE, type Paise, multiplyPaise, parseAmountInput } from "./money";
import { MARKER } from "./parse-dates";
import { isNumberWord, readNumberWords } from "./parse-numbers";

export type Token =
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
export function markCurrency(text: string): string {
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

export function tokenize(text: string, dates: readonly { raw: string }[]): Token[] {
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

export const count = (tokens: readonly Token[], kind: Token["kind"]) =>
  tokens.filter((t) => t.kind === kind).length;

// --- Splitting ---------------------------------------------------------------------------------

/** Commas inside numbers ("1,250") and dots in decimals don't separate entries. */
export const STRONG_BREAK = /(?:,(?!\d)|(?<!\d),|[;\n]+|\.(?=\s|$))/;
export const WEAK_BREAK = /\s+(?:and|plus|then|also|&)\s+/i;

export function splitPart(tokens: readonly Token[]): { tokens: Token[]; ambiguous: boolean }[] {
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
