/** Net spending in one period against another, overall and per category. */
import { ratioBasisPoints, subtractPaise, type Paise } from "./money";
import { type CategoryBreakdown } from "./aggregation";

// --- Period comparison ------------------------------------------------------------------

export interface Change {
  currentPaise: Paise;
  previousPaise: Paise;
  deltaPaise: Paise;
  /** Relative change in bp; null when the previous amount isn't positive (no baseline). */
  deltaBp: number | null;
}

export function change(currentPaise: Paise, previousPaise: Paise): Change {
  return {
    currentPaise,
    previousPaise,
    deltaPaise: subtractPaise(currentPaise, previousPaise),
    deltaBp: ratioBasisPoints(subtractPaise(currentPaise, previousPaise), previousPaise),
  };
}

export interface CategoryChange extends Change {
  key: string;
  /**
   * Subcategory with the largest change in the same direction as the category's ("mainly due to
   * snacks"). A subcategory moving against the total can't explain it, so it is never the driver.
   */
  mainDriver: (Change & { key: string }) | null;
}

export interface PeriodComparison {
  total: Change;
  categories: CategoryChange[];
  /** False when either period has too few purchases for a fair comparison. */
  comparable: boolean;
  reason: string | null;
}

/**
 * Compares two breakdowns (usually a period and `previousPeriod(period)`). With fewer than
 * `minTransactions` purchases in either period, the numbers are still returned but marked not
 * comparable, with the reason, so the UI can say the data is too sparse instead of
 * inventing a trend.
 */
export function comparePeriods(
  current: CategoryBreakdown,
  previous: CategoryBreakdown,
  options: { minTransactions?: number } = {},
): PeriodComparison {
  const min = options.minTransactions ?? 3;
  const prevByKey = new Map(previous.categories.map((c) => [c.key, c]));
  const curByKey = new Map(current.categories.map((c) => [c.key, c]));
  const keys = [...new Set([...curByKey.keys(), ...prevByKey.keys()])];

  const categories = keys.map((key): CategoryChange => {
    const cur = curByKey.get(key);
    const prev = prevByKey.get(key);
    const subPrev = new Map(prev?.subcategories.map((s) => [s.key, s.netPaise]) ?? []);
    const subCur = new Map(cur?.subcategories.map((s) => [s.key, s.netPaise]) ?? []);
    const direction = Math.sign((cur?.netPaise ?? 0) - (prev?.netPaise ?? 0));
    let mainDriver: CategoryChange["mainDriver"] = null;
    for (const subKey of new Set([...subCur.keys(), ...subPrev.keys()])) {
      const c = change(subCur.get(subKey) ?? 0, subPrev.get(subKey) ?? 0);
      if (
        Math.sign(c.deltaPaise) === direction &&
        direction !== 0 &&
        (!mainDriver || Math.abs(c.deltaPaise) > Math.abs(mainDriver.deltaPaise))
      ) {
        mainDriver = { key: subKey, ...c };
      }
    }
    return { key, ...change(cur?.netPaise ?? 0, prev?.netPaise ?? 0), mainDriver };
  });
  categories.sort(
    (a, b) => Math.abs(b.deltaPaise) - Math.abs(a.deltaPaise) || (a.key < b.key ? -1 : 1),
  );

  let reason: string | null = null;
  if (previous.expenseCount < min) {
    reason = `The previous period has only ${previous.expenseCount} purchase${previous.expenseCount === 1 ? "" : "s"}; at least ${min} are needed for a fair comparison.`;
  } else if (current.expenseCount < min) {
    reason = `This period has only ${current.expenseCount} purchase${current.expenseCount === 1 ? "" : "s"} so far; at least ${min} are needed for a fair comparison.`;
  }
  return {
    total: change(current.netPaise, previous.netPaise),
    categories,
    comparable: !reason,
    reason,
  };
}
