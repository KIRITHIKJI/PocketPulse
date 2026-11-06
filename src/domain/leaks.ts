/** The Money Leak Detector: repeated small purchases worth a second look, and what-if savings. */
import { netSpending, spendingEntries } from "./aggregation";
import { type Change, change } from "./period-comparison";
import { type Paise, multiplyPaise, ratioBasisPoints, sumPaise } from "./money";
import type { Transaction } from "./schemas";
import { type Period } from "./periods";
import {
  type PurchaseGroup,
  type PurchaseGrouping,
  MIN_REPEATS,
  purchaseGroups,
  smallPurchaseTotal,
} from "./purchases";

// --- Money Leak Detector --------------------------------------------------------------------

interface LeakGroup extends PurchaseGroup {
  /** Same group, same threshold, in the previous window; null with `comparisonNote` if unfair. */
  comparison: (Change & { previousCount: number }) | null;
  comparisonNote: string | null;
}

interface LeakReport {
  groups: LeakGroup[];
  /** Net total of the listed groups. Groups don't overlap within one grouping. */
  netPaise: Paise;
  shareBp: number | null;
  /** Small purchases this grouping can't place (no merchant recorded, say). */
  ungroupedCount: number;
}

interface LeakOptions {
  ledger: readonly Transaction[];
  period: Period;
  /** The window to compare with, or null when there isn't one (all time). */
  previous: Period | null;
  by: PurchaseGrouping;
  thresholdPaise: Paise;
  labelOf?: (key: string) => string;
  tileLabels?: ReadonlyMap<string, string>;
  minRepeats?: number;
}

export function leakReport({
  ledger,
  period,
  previous,
  by,
  thresholdPaise,
  labelOf,
  tileLabels,
  minRepeats = MIN_REPEATS,
}: LeakOptions): LeakReport {
  const options = { by, underPaise: thresholdPaise, labelOf, tileLabels };
  const all = purchaseGroups(ledger, period, options);
  const before = previous ? purchaseGroups(ledger, previous, options) : [];
  const beforeByKey = new Map(before.map((g) => [g.key, g]));
  const anyBefore = previous !== null && spendingEntries(ledger, previous).length > 0;
  const note = !previous
    ? "All time has no earlier period to compare with."
    : "Nothing was recorded in the previous period, so there’s nothing to compare yet.";

  const groups = all
    .filter((g) => g.count >= minRepeats)
    .map((g): LeakGroup => {
      const prev = beforeByKey.get(g.key);
      return {
        ...g,
        comparison: anyBefore
          ? { ...change(g.netPaise, prev?.netPaise ?? 0), previousCount: prev?.count ?? 0 }
          : null,
        comparisonNote: anyBefore ? null : note,
      };
    })
    .sort((a, b) => b.netPaise - a.netPaise || (a.key < b.key ? -1 : 1));

  const netPaise = sumPaise(groups.map((g) => g.netPaise));
  const small = smallPurchaseTotal(ledger, period, thresholdPaise);
  return {
    groups,
    netPaise,
    shareBp: netPaise < 0 ? null : ratioBasisPoints(netPaise, netSpending(ledger, period)),
    ungroupedCount: small.count - sumPaise(all.map((g) => g.count)),
  };
}

interface WhatIf {
  fewer: number;
  typicalPaise: Paise;
  savedPaise: Paise;
  /** Every purchase was the same amount, so "₹25 coffees" is exact, not "about". */
  sameAmount: boolean;
}

/** A plain estimate: `fewer` purchases at the group's median price, capped at what happened. */
export function whatIf(group: PurchaseGroup, fewer: number): WhatIf {
  const typicalPaise = group.medianPaise ?? 0;
  const capped = Math.min(Math.max(0, Math.trunc(fewer)), group.count);
  return {
    fewer: capped,
    typicalPaise,
    savedPaise: multiplyPaise(typicalPaise, capped),
    sameAmount: group.minPaise === group.maxPaise,
  };
}

export function whatIfText(
  label: string,
  result: WhatIf,
  money: (paise: Paise) => string,
  span: string,
): string {
  const price = money(result.typicalPaise);
  const count = result.fewer === 1 ? "one" : String(result.fewer);
  const noun = result.fewer === 1 ? "entry" : "entries";
  const at = result.sameAmount ? `at ${price}` : `at about ${price}`;
  const less = `${result.sameAmount ? "" : "about "}${money(result.savedPaise)}`;
  return `If you logged ${count} fewer ${label} ${noun} ${at} in ${span}, you’d spend ${less} less.`;
}
