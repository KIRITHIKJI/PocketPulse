/**
 * Budget math. A budget is a spending target, not cash set aside: it never changes balances
 * or safe-to-spend. "Spent" is net spending (expenses − refunds) from aggregation.ts, so a
 * budget always agrees with insights and reports for the same period.
 */
import { amountStats, netSpending, previousMonthStarts } from "./aggregation";
import { divRound, formatINR, ratioBasisPoints, subtractPaise, type Paise } from "./money";
import type { Budget, Transaction } from "./schemas";
import {
  DEFAULT_TIME_SETTINGS,
  type Instant,
  type LocalDate,
  type Period,
  type TimeSettings,
  endOfMonth,
  resolvePeriod,
} from "./time";

export function budgetPeriod(
  budget: Pick<Budget, "period" | "customFrom" | "customTo">,
  now: Instant,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
): Period {
  if (budget.period === "custom" && budget.customFrom && budget.customTo) {
    return resolvePeriod(
      { kind: "custom", from: budget.customFrom, to: budget.customTo },
      now,
      settings,
    );
  }
  return resolvePeriod(
    { kind: budget.period === "weekly" ? "this_week" : "this_month" },
    now,
    settings,
  );
}

export type BudgetStatus = "not_started" | "on_track" | "over_pace" | "exceeded" | "ended";

export interface BudgetEvaluation {
  budgetId: string;
  categoryId: string | null;
  period: Period;
  limitPaise: Paise;
  spentPaise: Paise;
  /** limit − spent; negative means over budget by that much. */
  remainingPaise: Paise;
  /** spent / limit in bp (may exceed 10 000). Negative spending (net refunds) counts as 0. */
  usedBp: number;
  /** Share of the period elapsed at `now`, in bp (0–10 000). */
  elapsedBp: number;
  /** Spending projected to the end of the period at the current pace; null before enough time passed. */
  projectedPaise: Paise | null;
  /** Even-pace allowance for what's left of the period, per remaining day (floor); null if ended. */
  dailyAllowancePaise: Paise | null;
  status: BudgetStatus;
  /** Thresholds (bp) reached so far, ascending. */
  reachedThresholdsBp: number[];
  explanation: string;
}

/** Projection needs at least this much of the period elapsed to avoid wild early guesses. */
const MIN_ELAPSED_FOR_PACE_BP = 1_000;

export function evaluateBudget(
  budget: Budget,
  ledger: readonly Transaction[],
  now: Instant,
  settings: TimeSettings = DEFAULT_TIME_SETTINGS,
  periodOverride?: Period,
): BudgetEvaluation {
  const period = periodOverride ?? budgetPeriod(budget, now, settings);
  const spentPaise = netSpending(ledger, period, budget.categoryId ?? undefined);
  const remainingPaise = subtractPaise(budget.limitPaise, spentPaise);
  const usedBp = ratioBasisPoints(Math.max(0, spentPaise), budget.limitPaise) ?? 0;

  const start = period.startMs!;
  const end = period.endMs!;
  const elapsedMs = Math.min(Math.max(now - start, 0), end - start);
  const elapsedBp = divRound(elapsedMs * 10_000, end - start, "floor");

  const projectedPaise =
    elapsedBp >= MIN_ELAPSED_FOR_PACE_BP && now < end
      ? divRound(Math.max(0, spentPaise) * (end - start), elapsedMs)
      : now >= end
        ? spentPaise
        : null;

  const remainingDays = now >= end ? 0 : divRound(end - Math.max(now, start), 86_400_000, "ceil");
  const dailyAllowancePaise =
    remainingDays === 0 ? null : Math.max(0, divRound(remainingPaise, remainingDays, "floor"));

  const reachedThresholdsBp = [...new Set(budget.alertThresholdsBp)]
    .sort((a, b) => a - b)
    .filter((t) => usedBp >= t);

  let status: BudgetStatus;
  if (now < start) status = "not_started";
  else if (spentPaise > budget.limitPaise) status = "exceeded";
  else if (now >= end) status = "ended";
  else if (projectedPaise !== null && projectedPaise > budget.limitPaise) status = "over_pace";
  else status = "on_track";

  const scope = budget.categoryId ? "this category" : "all spending";
  const pieces = [
    `${formatINR(Math.max(0, spentPaise))} of ${formatINR(budget.limitPaise)} spent on ${scope}`,
    remainingPaise >= 0
      ? `${formatINR(remainingPaise)} left`
      : `${formatINR(-remainingPaise)} over the target`,
  ];
  if (status === "over_pace" && projectedPaise !== null) {
    pieces.push(
      `at this pace you'd reach about ${formatINR(projectedPaise)} by the end of the period`,
    );
  }
  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    period,
    limitPaise: budget.limitPaise,
    spentPaise,
    remainingPaise,
    usedBp,
    elapsedBp,
    projectedPaise,
    dailyAllowancePaise,
    status,
    reachedThresholdsBp,
    explanation: `${pieces.join("; ")}. A budget is a target, not money set aside.`,
  };
}

/** Thresholds newly crossed between two evaluations (e.g. after adding an expense) — alert once each. */
export function newlyReachedThresholds(
  before: BudgetEvaluation,
  after: BudgetEvaluation,
): number[] {
  return after.reachedThresholdsBp.filter((t) => !before.reachedThresholdsBp.includes(t));
}

/**
 * Suggests a monthly limit from the median net spending of up to `months` complete previous
 * months (never months before tracking started), rounded up to the nearest ₹50. Returns null
 * when there's no complete month of history — a suggestion from no data would be invented.
 */
export function suggestMonthlyLimit(
  ledger: readonly Transaction[],
  today: LocalDate,
  options: {
    categoryId?: string | null;
    months?: number;
    settings?: TimeSettings;
    trackingStart?: LocalDate;
  } = {},
): { limitPaise: Paise; basedOnMonths: number; explanation: string } | null {
  const settings = options.settings ?? DEFAULT_TIME_SETTINGS;
  const totals: Paise[] = [];
  for (const from of previousMonthStarts(today, options.months ?? 3)) {
    if (options.trackingStart && from < options.trackingStart) break;
    const period = resolvePeriod({ kind: "custom", from, to: endOfMonth(from) }, 0, settings);
    totals.push(Math.max(0, netSpending(ledger, period, options.categoryId ?? undefined)));
  }
  const median = amountStats(totals).medianPaise;
  if (median === null || median === 0) return null;
  const step = 5_000;
  const limitPaise = divRound(median, step, "ceil") * step;
  const n = totals.length;
  return {
    limitPaise,
    basedOnMonths: n,
    explanation: `Typical (median) spending over the last ${n} complete month${n === 1 ? "" : "s"} was ${formatINR(median)}, rounded up to ${formatINR(limitPaise)}.`,
  };
}
