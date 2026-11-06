/** Spoken number words for the entry parser: "fifteen" → 15, "one fifty" → 150. */
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

export const isNumberWord = (word: string) =>
  word in UNITS || word in TENS || word === "hundred" || word === "thousand";

/**
 * "fifteen" → 15, "two hundred fifty" → 250, and the Indian spoken form "one fifty" → 150.
 * Returns the whole-rupee value and how many words it used.
 */
export function readNumberWords(words: readonly string[], start: number) {
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
