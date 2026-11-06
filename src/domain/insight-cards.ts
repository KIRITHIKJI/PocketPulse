/** Insight cards and unusual category changes: the sentences Insights shows, with their scopes. */
import {
  type CategoryBreakdown,
  UNCATEGORIZED,
  amountStats,
  categoryBreakdown,
} from "./aggregation";
import { type CategoryChange, type PeriodComparison } from "./period-comparison";
import { type Paise, formatBasisPoints } from "./money";
import { MIN_REPEATS, type PurchaseGroup, type SmallPurchaseTotal } from "./purchases";
import { firstSpendingDate } from "./recurring-signals";
import type { Transaction } from "./schemas";
import { compareLocalDates } from "./time";
import { type Period } from "./periods";
import {
  type ComparisonWindows,
  type InsightWords,
  type SpendingScope,
  periodScope,
} from "./insight-scope";

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const entriesText = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;
const lastSegment = (label: string) => label.split(" › ").at(-1)!;

// --- Insight cards ---------------------------------------------------------------------------

type InsightKind = "repeat" | "change" | "small" | "biggest" | "unassigned";

export interface InsightCard {
  id: string;
  kind: InsightKind;
  text: string;
  paise: Paise;
  scope: SpendingScope;
}

/**
 * "You logged Bus 4 times for ₹20 each: ₹80 this month." Labels are whatever the user typed (a
 * thing, a ride, a recharge), so the sentence names them as written and says "logged", which
 * reads right for all of them. "You bought bus" didn't.
 */
export function repeatInsightText(group: PurchaseGroup, words: InsightWords): string {
  const { money } = words;
  const price =
    group.minPaise === group.maxPaise
      ? `for ${money(group.minPaise!)} each`
      : `for about ${money(group.averagePaise!)} each`;
  const refunded =
    group.refundsPaise > 0
      ? `, or ${money(group.netPaise)} after ${money(group.refundsPaise)} in refunds`
      : "";
  return `You logged ${group.label} ${times(group.count)} ${price}: ${money(group.grossPaise)} ${words.period}${refunded}.`;
}

/** "Food & Drinks increased by ₹450 compared with the previous week, mainly due to snacks." */
function changeInsightText(item: CategoryChange, words: InsightWords, previous: string): string {
  const up = item.deltaPaise > 0;
  const driver = item.mainDriver;
  // "Mainly" has to be true: the subcategory must account for at least half the change.
  const mainly =
    driver &&
    driver.key !== UNCATEGORIZED &&
    Math.abs(driver.deltaPaise) * 2 >= Math.abs(item.deltaPaise)
      ? `, mainly due to ${lastSegment(words.labelOf(driver.key)).toLowerCase()}`
      : "";
  return `${lastSegment(words.labelOf(item.key))} ${up ? "increased" : "decreased"} by ${words.money(Math.abs(item.deltaPaise))} compared with ${previous}${mainly}.`;
}

export function buildCards(input: {
  breakdown: CategoryBreakdown;
  comparison: PeriodComparison | null;
  repeats: readonly PurchaseGroup[];
  small: SmallPurchaseTotal;
  changes: readonly CategoryChange[];
  scope: Pick<SpendingScope, "from" | "to">;
  words: InsightWords;
}): InsightCard[] {
  const { breakdown, repeats, small, changes, scope, words } = input;
  const { money } = words;
  const cards: InsightCard[] = [];
  const spending = { type: "spending", ...scope } as const;

  for (const group of repeats.slice(0, 3)) {
    cards.push({
      id: `repeat:${group.key}`,
      kind: "repeat",
      text: repeatInsightText(group, words),
      paise: group.netPaise,
      scope: { ...spending, by: group.by, key: group.key },
    });
  }
  if (words.previous) {
    for (const item of changes.slice(0, 2)) {
      cards.push({
        id: `change:${item.key}`,
        kind: "change",
        text: changeInsightText(item, words, words.previous),
        paise: item.currentPaise,
        scope: { ...spending, category: item.key },
      });
    }
  }
  if (small.count >= MIN_REPEATS && small.shareBp !== null) {
    cards.push({
      id: "small",
      kind: "small",
      text: `${plural(small.count, "purchase")} under ${money(small.thresholdPaise)} added up to ${money(small.netPaise)} ${words.period}, ${formatBasisPoints(small.shareBp, 0)} of your spending.`,
      paise: small.netPaise,
      scope: { ...spending, underPaise: small.thresholdPaise },
    });
  }
  const [top, second] = breakdown.categories;
  if (top && second && breakdown.expenseCount >= MIN_REPEATS && top.netPaise > 0) {
    const share = top.shareBp === null ? "" : `, ${formatBasisPoints(top.shareBp, 0)} of spending`;
    cards.push({
      id: "biggest",
      kind: "biggest",
      text: `${lastSegment(words.labelOf(top.key))} was your biggest category ${words.period}: ${money(top.netPaise)}${share}.`,
      paise: top.netPaise,
      scope: { ...spending, category: top.key },
    });
  }
  const unassigned = breakdown.categories.find((c) => c.key === UNCATEGORIZED);
  if (unassigned) {
    const entries = unassigned.count + unassigned.refundCount;
    cards.push({
      id: "unassigned",
      kind: "unassigned",
      text: `${entriesText(entries)} worth ${money(unassigned.netPaise)} ${entries === 1 ? "has" : "have"} no category yet.`,
      paise: unassigned.netPaise,
      scope: { ...spending, category: UNCATEGORIZED },
    });
  }
  return cards;
}

// --- Unusual changes -------------------------------------------------------------------------

export interface UnusualChange {
  key: string;
  direction: "higher" | "lower";
  currentPaise: Paise;
  typicalPaise: Paise;
  text: string;
  /** Plain-language "how we detected this". */
  how: string;
  scope: SpendingScope;
}

export const BASELINE_WINDOWS = 4;
export const MIN_BASELINE_WINDOWS = 3;

/** Earlier windows fit to judge "usual": from before tracking began, ₹0 would be meaningless. */
export function usableBaseline(
  ledger: readonly Transaction[],
  windows: ComparisonWindows,
): Period[] {
  const first = firstSpendingDate(ledger, windows.current.timeZone);
  if (first === null) return [];
  return windows.previous
    .filter((w) => compareLocalDates(w.startDate!, first) >= 0)
    .slice(0, BASELINE_WINDOWS);
}

/**
 * A category is unusual when it is at least 1.5× or at most half the median of up to four
 * earlier windows, and the gap is at least the user's small-purchase amount, so that ₹3 against
 * ₹1 is never reported.
 */
export function unusualChanges(
  ledger: readonly Transaction[],
  windows: ComparisonWindows,
  thresholdPaise: Paise,
  words: InsightWords,
): UnusualChange[] {
  const baseline = usableBaseline(ledger, windows);
  if (baseline.length < MIN_BASELINE_WINDOWS) return [];

  const current = categoryBreakdown(ledger, windows.current);
  const before = baseline.map((w) => categoryBreakdown(ledger, w));
  const keys = new Set([
    ...current.categories.map((c) => c.key),
    ...before.flatMap((b) => b.categories.map((c) => c.key)),
  ]);
  const netIn = (b: CategoryBreakdown, key: string) =>
    b.categories.find((c) => c.key === key)?.netPaise ?? 0;

  const found: UnusualChange[] = [];
  for (const key of keys) {
    const now = netIn(current, key);
    const nets = before.map((b) => netIn(b, key));
    const typical = amountStats(nets).medianPaise ?? 0;
    if (typical <= 0) continue;
    const higher = now * 2 >= typical * 3 && now - typical >= thresholdPaise;
    const lower = now * 2 <= typical && typical - now >= thresholdPaise;
    if (!higher && !lower) continue;

    const { money, labelOf, unit, period } = words;
    const name = lastSegment(labelOf(key));
    const list = nets.map(money).join(", ");
    found.push({
      key,
      direction: higher ? "higher" : "lower",
      currentPaise: now,
      typicalPaise: typical,
      text: `${name} is ${higher ? "higher" : "lower"} than usual ${period}: ${money(now)}, against a typical ${money(typical)}.`,
      how: `We compared it with your previous ${baseline.length} ${unit}s (${list}). The median is ${money(typical)}. We point out a category when it reaches 1.5× the median or falls to half of it, and the gap is at least your small-purchase amount of ${money(thresholdPaise)}.`,
      scope: {
        type: "spending",
        category: key,
        ...periodScope(now === 0 ? baseline[0]! : windows.current),
      },
    });
  }
  return found.sort(
    (a, b) =>
      Math.abs(b.currentPaise - b.typicalPaise) - Math.abs(a.currentPaise - a.typicalPaise) ||
      (a.key < b.key ? -1 : 1),
  );
}
