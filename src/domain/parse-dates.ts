/**
 * Dates in typed or spoken entry text for the entry parser: numeric and named dates, relative
 * words ("yesterday", "3 days ago"), weekdays, and the Hindi day words with their mishearings.
 * Each date found is swapped for a marker, so "24/10" is never read as an amount.
 */
import { type LocalDate, addDays, isLocalDate, parseLocalDate, weekdayOf } from "./time";
import { isNumberWord } from "./parse-numbers";

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

export type DayWord = "aaj" | "kal" | "parso";

/** How many days back each Hindi day word means when it's about a past purchase. */
const DAY_WORD_OFFSET: Record<DayWord, number> = { aaj: 0, kal: -1, parso: -2 };

/**
 * What speech recognition has been seen or is likely to write for a Hindi day word. To teach it a
 * new spelling, add one line here and a test. "age", "person" and "parcel" are left out on
 * purpose: they're everyday items, and each is worth keeping as what it says.
 */
const HEARD_DAY_WORDS: Record<string, DayWord> = {
  call: "kal",
  cal: "kal",
  kall: "kal",
  kaal: "kal",
  khal: "kal",
  cull: "kal",
  aj: "aaj",
  aja: "aaj",
  aaja: "aaj",
  aaje: "aaj",
  parsu: "parso",
  parsoo: "parso",
  parsho: "parso",
  paarso: "parso",
  perso: "parso",
  paso: "parso",
};

/** What a heard word becomes while parsing, so the review can say where the date came from. */
const HEARD_MARK = "heardas";
export const HEARD_PATTERN = `${HEARD_MARK}_(aaj|kal|parso)_([a-z]+)`;

/** The rest of a Hindi day phrase, so "kal raat ka dinner 200" leaves just "dinner". */
const HINDI_DAY_TAIL = "(?:\\s+(?:subah|dopahar|shaam|sham|raat))?(?:\\s+(?:ka|ki|ke))?\\b";

/** `\\b` only knows Latin letters, so Devanagari words check their own edges. */
function devanagariDay(words: string) {
  const edge = "[\\p{L}\\p{M}]";
  const tail = "(?:\\s+(?:सुबह|दोपहर|शाम|रात))?(?:\\s+(?:का|की|के))?";
  return new RegExp(`(?<!${edge})(?:${words})${tail}(?!${edge})`, "gu");
}

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
  [
    new RegExp(`\\b${HEARD_PATTERN}\\b${HINDI_DAY_TAIL}`, "gi"),
    (m, today) => addDays(today, DAY_WORD_OFFSET[m[1]!.toLowerCase() as DayWord]),
  ],
  [devanagariDay("परसों|परसो"), (_, today) => addDays(today, -2)],
  [devanagariDay("कल"), (_, today) => addDays(today, -1)],
  [devanagariDay("आज"), (_, today) => today],
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
export const MARKER = /^(\d+)$/;

export function extractDates(text: string, today: LocalDate) {
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

/** Words that make the next "call" a phone call or an action: "phone call 50", "for call 20". */
const CALL_AFTER = new Set(
  "phone mobile video voice audio missed conference whatsapp zoom international isd std local roaming wake a an the my one per each to for this that".split(
    " ",
  ),
);
/** Words that do the same from behind: "call charges 99", "call taxi 200", "call back". */
const CALL_BEFORE = new Set(
  "charge charges recharge taxi cab center centre pack plan rate rates bill minutes mins credit balance back me him her them".split(
    " ",
  ),
);

const HEARD_WORD = new RegExp(`\\b(?:${Object.keys(HEARD_DAY_WORDS).join("|")})\\b`, "gi");

/**
 * Speech recognition may write a Hindi day word as something else. In one spoken entry that has an
 * amount and no date of its own, a word from `HEARD_DAY_WORDS` reads as its day word, unless the
 * words beside it make it a real call. So "call chai 15", "chai 15 call" and "parsu auto 60" get a
 * date, and "phone call 50" and "call charges 99" are left alone. Entries are split as usual, so
 * each is judged on its own words.
 */
export function respellHeardDayWords(text: string, today: LocalDate): string {
  return text.replace(/[^,;\n]+/g, (segment) => {
    const words = segment.toLowerCase().split(/\s+/);
    const hasAmount = /\d/.test(segment) || words.some(isNumberWord);
    if (!hasAmount || extractDates(segment, today).found.length > 0) return segment;
    return segment.replace(HEARD_WORD, (word, offset: number) => {
      const heard = word.toLowerCase();
      const before = /([\p{L}\p{N}]+)\s*$/u.exec(segment.slice(0, offset))?.[1]?.toLowerCase();
      const after = /^\s*([\p{L}\p{N}]+)/u.exec(segment.slice(offset + word.length))?.[1];
      const isCall =
        heard === "call" &&
        ((before !== undefined && CALL_AFTER.has(before)) ||
          (after !== undefined && CALL_BEFORE.has(after.toLowerCase())));
      return isCall ? word : `${HEARD_MARK}_${HEARD_DAY_WORDS[heard]!}_${heard}`;
    });
  });
}
