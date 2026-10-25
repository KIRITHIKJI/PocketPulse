/**
 * Money primitives. Every amount is an integer number of paise (1/100 of a rupee).
 *
 * JavaScript numbers hold integers exactly up to 2^53, far beyond any amount we accept
 * (`MAX_AMOUNT_PAISE`). Addition/subtraction of safe integers is exact; anything that
 * divides goes through `divRound`, which uses BigInt so no binary fraction is ever produced.
 * Floating point is never used for money, including when parsing user input.
 */

export type Paise = number;

/** ₹9,99,99,99,999.99 — the largest single amount the app accepts. */
export const MAX_AMOUNT_PAISE: Paise = 999_999_999_999;

export const DEFAULT_CURRENCY = "INR";
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED ",
  SGD: "S$",
};

export class MoneyError extends Error {
  override name = "MoneyError";
}

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of paise, got ${String(value)}`);
  }
  return value;
}

function checked(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new MoneyError("Money arithmetic overflowed");
  return value;
}

export function addPaise(a: Paise, b: Paise): Paise {
  return checked(assertPaise(a) + assertPaise(b));
}

export function subtractPaise(a: Paise, b: Paise): Paise {
  return checked(assertPaise(a) - assertPaise(b));
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) total = addPaise(total, v);
  return total;
}

export function multiplyPaise(amount: Paise, factor: number): Paise {
  if (!Number.isSafeInteger(factor)) throw new MoneyError("Multiplier must be an integer");
  return checked(assertPaise(amount) * factor);
}

export function minPaise(a: Paise, b: Paise): Paise {
  return a < b ? a : b;
}

export function maxPaise(a: Paise, b: Paise): Paise {
  return a > b ? a : b;
}

export type RoundingMode = "half-up" | "floor" | "ceil";

/**
 * Exact integer division `numerator / denominator` with explicit rounding.
 * "half-up" rounds halves away from zero (₹0.005 → ₹0.01, −₹0.005 → −₹0.01).
 * "floor"/"ceil" round towards −∞/+∞ — use floor for "you can spend at most" limits.
 */
export function divRound(numerator: number, denominator: number, mode: RoundingMode = "half-up") {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new MoneyError("divRound needs integers");
  }
  if (denominator === 0) throw new MoneyError("Division by zero");
  let n = BigInt(numerator);
  let d = BigInt(denominator);
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const q = n / d; // truncates towards zero
  const r = n % d;
  if (r === 0n) return Number(q);
  const negative = n < 0n;
  switch (mode) {
    case "floor":
      return Number(negative ? q - 1n : q);
    case "ceil":
      return Number(negative ? q : q + 1n);
    case "half-up": {
      const twice = (r < 0n ? -r : r) * 2n;
      if (twice >= d) return Number(negative ? q - 1n : q + 1n);
      return Number(q);
    }
  }
}

/**
 * `part / whole` in basis points (1 bp = 0.01 %, 10 000 bp = 100 %), half-up.
 * Returns null when `whole` is not positive, because a share of nothing is undefined.
 */
export function ratioBasisPoints(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return divRound(part * 10_000, whole);
}

/** Formats basis points as a percentage, e.g. 1250 → "12.5%", 10000 → "100%". */
export function formatBasisPoints(bp: number, maxFractionDigits: 0 | 1 | 2 = 1): string {
  const sign = bp < 0 ? "−" : "";
  const abs = Math.abs(bp);
  const scale = 10 ** (2 - maxFractionDigits);
  const rounded = divRound(abs, scale); // in units of 10^-maxFractionDigits percent
  const unit = 10 ** maxFractionDigits;
  const whole = Math.trunc(rounded / unit);
  const frac = rounded % unit;
  if (frac === 0) return `${sign}${whole}%`;
  const fracText = String(frac).padStart(maxFractionDigits, "0").replace(/0+$/, "");
  return `${sign}${whole}.${fracText}%`;
}

// ---------------------------------------------------------------------------
// Parsing

export type ParseAmountError =
  "empty" | "invalid" | "too_many_decimals" | "negative" | "zero" | "too_large";

export type ParseAmountResult =
  { ok: true; paise: Paise } | { ok: false; error: ParseAmountError; message: string };

const PARSE_MESSAGES: Record<ParseAmountError, string> = {
  empty: "Enter an amount.",
  invalid: "Enter an amount like 15, 40 or 12.50.",
  too_many_decimals: "Use at most 2 decimal places (paise).",
  negative: "Enter a positive amount. The transaction type decides whether money comes in or out.",
  zero: "Amount must be more than ₹0.",
  too_large: "That amount is too large.",
};

function fail(error: ParseAmountError): ParseAmountResult {
  return { ok: false, error, message: PARSE_MESSAGES[error] };
}

// Integer part with optional thousands separators (Indian "1,25,000" or western "125,000").
const AMOUNT_PATTERN = /^(\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}|\d+)?(?:\.(\d*))?$/;

/**
 * Parses what a person types into an amount field: "15", "₹40", "Rs. 12.50", "INR 1,25,000",
 * "₹ 99.9", "/-" suffixes ("40/-"). The string is parsed digit by digit — never via
 * parseFloat — and more than 2 decimal places is rejected rather than silently rounded.
 */
export function parseAmountInput(
  input: string,
  options: { allowZero?: boolean } = {},
): ParseAmountResult {
  let text = input.normalize("NFKC").trim();
  if (text === "") return fail("empty");

  let negative = false;
  if (/^[-−]/.test(text)) {
    negative = true;
    text = text.slice(1).trim();
  }
  text = text
    .replace(/^(?:₹|rs\.?|inr|rupees?)\s*/i, "")
    .replace(/\s*(?:\/-|₹|rs\.?|inr|rupees?)$/i, "")
    .trim();
  if (/^[-−]/.test(text)) {
    negative = true;
    text = text.slice(1).trim();
  }
  text = text.replace(/\s+/g, "");
  if (text === "" || text === ".") return fail(text === "" && !negative ? "empty" : "invalid");

  const match = AMOUNT_PATTERN.exec(text);
  if (!match || (match[1] === undefined && (match[2] === undefined || match[2] === ""))) {
    return fail("invalid");
  }
  const intDigits = (match[1] ?? "0").replace(/,/g, "");
  const fracDigits = match[2] ?? "";
  if (fracDigits.length > 2) return fail("too_many_decimals");
  if (negative) return fail("negative");

  // Guard length before converting so absurd inputs can't lose precision.
  const trimmedInt = intDigits.replace(/^0+(?=\d)/, "");
  if (trimmedInt.length > 13) return fail("too_large");
  const paise = Number(trimmedInt) * 100 + Number(fracDigits.padEnd(2, "0"));
  if (paise > MAX_AMOUNT_PAISE) return fail("too_large");
  if (paise === 0 && !options.allowZero) return fail("zero");
  return { ok: true, paise };
}

// ---------------------------------------------------------------------------
// Formatting

/** Groups an integer digit string the Indian way: 12500000 → "1,25,00,000". */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
}

function groupWestern(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface FormatMoneyOptions {
  currency?: CurrencyCode;
  /** "auto" shows paise only when non-zero (₹15, ₹12.50); "always" → ₹15.00; "never" rounds half-up. */
  paise?: "auto" | "always" | "never";
  /** "negative" (default) prefixes − for negatives; "always" also prefixes + for positives. */
  sign?: "negative" | "always";
}

/**
 * Formats paise for display: 12500000 → "₹1,25,000", 1250 → "₹12.50", −4000 → "−₹40".
 * Uses string arithmetic on the integer, so the result is exact for every amount.
 */
export function formatMoney(amount: Paise, options: FormatMoneyOptions = {}): string {
  assertPaise(amount);
  const currency = options.currency ?? DEFAULT_CURRENCY;
  const paiseMode = options.paise ?? "auto";
  let abs = Math.abs(amount);
  if (paiseMode === "never") abs = divRound(abs, 100) * 100;
  const rupees = Math.trunc(abs / 100);
  const fraction = abs % 100;
  const grouped = currency === "INR" ? groupIndian(String(rupees)) : groupWestern(String(rupees));
  const showFraction = paiseMode === "always" || (paiseMode === "auto" && fraction !== 0);
  const body = `${CURRENCY_SYMBOLS[currency]}${grouped}${showFraction ? `.${String(fraction).padStart(2, "0")}` : ""}`;
  const isZero = abs === 0;
  if (amount < 0 && !isZero) return `−${body}`;
  if (options.sign === "always" && !isZero) return `+${body}`;
  return body;
}

export function formatINR(amount: Paise, options: Omit<FormatMoneyOptions, "currency"> = {}) {
  return formatMoney(amount, { ...options, currency: "INR" });
}

/**
 * Short form for tight UI: ₹950, ₹1.2K, ₹12.5K, ₹1.25L, ₹3.4Cr (Indian lakh/crore).
 * Truncates (never rounds up) so a compact label never overstates an amount.
 */
export function formatINRCompact(amount: Paise): string {
  assertPaise(amount);
  const sign = amount < 0 ? "−" : "";
  const rupees = Math.trunc(Math.abs(amount) / 100);
  const units: Array<[number, string, number]> = [
    [10_000_000, "Cr", 2],
    [100_000, "L", 2],
    [1_000, "K", 1],
  ];
  for (const [size, suffix, digits] of units) {
    if (rupees >= size) {
      const scaled = divRound(rupees * 10 ** digits, size, "floor");
      const whole = Math.trunc(scaled / 10 ** digits);
      const frac = String(scaled % 10 ** digits)
        .padStart(digits, "0")
        .replace(/0+$/, "");
      return `${sign}₹${groupIndian(String(whole))}${frac ? `.${frac}` : ""}${suffix}`;
    }
  }
  return `${sign}₹${rupees}`;
}

/** Plain decimal for CSV/spreadsheets: 12550 → "125.50", −5 → "-0.05". No symbol, no grouping. */
export function paiseToDecimalString(amount: Paise): string {
  assertPaise(amount);
  const abs = Math.abs(amount);
  const text = `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return amount < 0 ? `-${text}` : text;
}

/** Converts whole rupees (e.g. from a config constant) to paise. */
export function rupees(value: number): Paise {
  return multiplyPaise(value, 100);
}
