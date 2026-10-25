/**
 * Savings goals are earmarks on money the user already tracks. Allocations and releases change
 * how much is set aside — and therefore flexible/safe-to-spend money — but never the tracked
 * balance, income or spending.
 *
 * Buying the thing you saved for is two separate records: a real `expense` (reduces the
 * balance) plus an `allocation_release` of the earmark (`releaseForGoalPurchase`), so the money
 * isn't subtracted twice — once as spending and again as still-earmarked savings.
 */
import {
  addPaise,
  divRound,
  formatINR,
  minPaise,
  ratioBasisPoints,
  subtractPaise,
  type Paise,
} from "./money";
import { isActive, occurredAtMs } from "./ledger";
import type { SavingsGoal, Transaction } from "./schemas";
import { type Instant, type LocalDate, daysBetween } from "./time";

/** Net earmarked per goal (allocations − releases), optionally as of an instant. */
export function earmarkedByGoal(
  ledger: readonly Transaction[],
  asOfMs?: Instant,
): Map<string, Paise> {
  const totals = new Map<string, Paise>();
  for (const tx of ledger) {
    if (tx.type !== "allocation" && tx.type !== "allocation_release") continue;
    if (!isActive(tx) || (asOfMs !== undefined && occurredAtMs(tx) >= asOfMs)) continue;
    const delta = tx.type === "allocation" ? tx.amountPaise : -tx.amountPaise;
    totals.set(tx.goalId, addPaise(totals.get(tx.goalId) ?? 0, delta));
  }
  return totals;
}

export function earmarkedForGoal(goalId: string, ledger: readonly Transaction[], asOfMs?: Instant) {
  return earmarkedByGoal(ledger, asOfMs).get(goalId) ?? 0;
}

/**
 * Everything currently set aside, across all goals — including paused, completed and archived
 * ones, because their money stays earmarked until it is explicitly released.
 */
export function totalEarmarked(ledger: readonly Transaction[], asOfMs?: Instant): Paise {
  let total = 0;
  for (const v of earmarkedByGoal(ledger, asOfMs).values()) total = addPaise(total, v);
  return total;
}

export type ContributionCadence = "weekly" | "monthly";

export interface GoalProgress {
  goalId: string;
  targetPaise: Paise;
  savedPaise: Paise;
  remainingPaise: Paise;
  /** saved / target in bp, capped at 10 000. */
  progressBp: number;
  completed: boolean;
  daysLeft: number | null;
  /** Suggested amount per period to hit the target date; null without a future target date. */
  suggested: { cadence: ContributionCadence; amountPaise: Paise; periods: number } | null;
  explanation: string;
}

export function goalProgress(
  goal: SavingsGoal,
  ledger: readonly Transaction[],
  today: LocalDate,
  cadence: ContributionCadence = "weekly",
): GoalProgress {
  const savedPaise = earmarkedForGoal(goal.id, ledger);
  const remainingPaise = Math.max(0, subtractPaise(goal.targetPaise, savedPaise));
  const progressBp = Math.min(
    10_000,
    ratioBasisPoints(Math.max(0, savedPaise), goal.targetPaise) ?? 0,
  );
  const completed = remainingPaise === 0;
  const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : null;

  let suggested: GoalProgress["suggested"] = null;
  let explanation: string;
  if (completed) {
    explanation = `Target of ${formatINR(goal.targetPaise)} reached.`;
  } else if (daysLeft === null) {
    explanation = `${formatINR(remainingPaise)} to go. Add a target date to get a suggested ${cadence} amount.`;
  } else if (daysLeft <= 0) {
    explanation = `The target date has passed with ${formatINR(remainingPaise)} still to go. Choose a new date to get a suggestion.`;
  } else {
    // Number of contributions left, counting one for the current week/month.
    const periods =
      cadence === "weekly" ? divRound(daysLeft, 7, "ceil") : divRound(daysLeft, 30, "ceil");
    const amountPaise = divRound(remainingPaise, periods, "ceil");
    suggested = { cadence, amountPaise, periods };
    explanation = `${formatINR(remainingPaise)} to go in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: about ${formatINR(amountPaise)} per ${cadence === "weekly" ? "week" : "month"} for ${periods} ${cadence === "weekly" ? "week" : "month"}${periods === 1 ? "" : "s"}.`;
  }
  return {
    goalId: goal.id,
    targetPaise: goal.targetPaise,
    savedPaise,
    remainingPaise,
    progressBp,
    completed,
    daysLeft,
    suggested,
    explanation,
  };
}

/** Amount to release from a goal when a real purchase is paid with its money. */
export function releaseForGoalPurchase(
  goalId: string,
  purchasePaise: Paise,
  ledger: readonly Transaction[],
): Paise {
  return minPaise(purchasePaise, Math.max(0, earmarkedForGoal(goalId, ledger)));
}
