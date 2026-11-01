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
import { indexById, isActive, occurredAtMs } from "./ledger";
import type { AllocationTransaction, SavingsGoal, Transaction } from "./schemas";
import { type Instant, type LocalDate, addDays, daysBetween, toLocalDate } from "./time";

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
  money: (paise: Paise) => string = formatINR,
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
    explanation = `Target of ${money(goal.targetPaise)} reached.`;
  } else if (daysLeft === null) {
    explanation = `${money(remainingPaise)} to go. Add a target date to get a suggested ${cadence} amount.`;
  } else if (daysLeft <= 0) {
    explanation = `The target date has passed with ${money(remainingPaise)} still to go. Choose a new date to get a suggestion.`;
  } else {
    // Number of contributions left, counting one for the current week/month.
    const periods =
      cadence === "weekly" ? divRound(daysLeft, 7, "ceil") : divRound(daysLeft, 30, "ceil");
    const amountPaise = divRound(remainingPaise, periods, "ceil");
    suggested = { cadence, amountPaise, periods };
    explanation = `${money(remainingPaise)} to go in ${daysLeft} day${daysLeft === 1 ? "" : "s"}: about ${money(amountPaise)} per ${cadence === "weekly" ? "week" : "month"} for ${periods} ${cadence === "weekly" ? "week" : "month"}${periods === 1 ? "" : "s"}.`;
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

/** What a purchase takes out of `savedPaise`: all of the price, or all that was saved. */
export function releaseFromSaved(purchasePaise: Paise, savedPaise: Paise): Paise {
  return minPaise(purchasePaise, Math.max(0, savedPaise));
}

/** Amount to release from a goal when a real purchase is paid with its money. */
export function releaseForGoalPurchase(
  goalId: string,
  purchasePaise: Paise,
  ledger: readonly Transaction[],
): Paise {
  return releaseFromSaved(purchasePaise, earmarkedForGoal(goalId, ledger));
}

/** On a release whose purchase was deleted: the user chose to leave that money flexible. */
export const KEPT_FLEXIBLE_TAG = "kept flexible";

/** The release saved with a goal purchase: it shares the expense's batch, and its id is that batch. */
export function purchaseRelease(
  expense: Pick<Transaction, "batchId">,
  ledger: readonly Transaction[],
): AllocationTransaction | null {
  if (!expense.batchId) return null;
  const release = indexById(ledger).get(expense.batchId);
  return release?.type === "allocation_release" && isActive(release) ? release : null;
}

/**
 * Releases left behind when their purchase was deleted on its own. Deleting an entry only removes
 * that entry, so the money stays out of the goal and flexible until the user decides. Undoing a
 * purchase removes both rows, so it never lands here.
 */
export function orphanedPurchaseReleases(ledger: readonly Transaction[]): AllocationTransaction[] {
  const purchased = new Set(
    ledger.flatMap((tx) =>
      tx.type === "expense" && isActive(tx) && tx.batchId ? [tx.batchId] : [],
    ),
  );
  return ledger.filter(
    (tx): tx is AllocationTransaction =>
      tx.type === "allocation_release" &&
      isActive(tx) &&
      tx.batchId === tx.id &&
      !purchased.has(tx.id) &&
      !tx.tags.includes(KEPT_FLEXIBLE_TAG),
  );
}

/** Set-asides so far: the goal's allocations and releases, newest first. */
export function goalMoves(goalId: string, ledger: readonly Transaction[]): AllocationTransaction[] {
  return ledger
    .filter(
      (tx): tx is AllocationTransaction =>
        (tx.type === "allocation" || tx.type === "allocation_release") &&
        tx.goalId === goalId &&
        isActive(tx),
    )
    .sort((a, b) => occurredAtMs(b) - occurredAtMs(a));
}

export interface GoalForecast {
  /** Net set aside per day so far, whole paise (floor). */
  dailyPacePaise: Paise;
  reachedOn: LocalDate;
}

/** A goal needs this much history before its pace means anything. */
const MIN_FORECAST_ALLOCATIONS = 2;

/**
 * When the goal would reach its target if money keeps being set aside at the pace so far, from the
 * first allocation until today. An estimate, and null when there's too little to base one on.
 */
export function goalForecast(
  goal: SavingsGoal,
  ledger: readonly Transaction[],
  now: Instant,
  timeZone: string,
): GoalForecast | null {
  const moves = goalMoves(goal.id, ledger);
  const allocations = moves.filter((tx) => tx.type === "allocation");
  if (allocations.length < MIN_FORECAST_ALLOCATIONS) return null;
  const saved = earmarkedForGoal(goal.id, ledger);
  const remaining = subtractPaise(goal.targetPaise, saved);
  if (remaining <= 0 || saved <= 0) return null;
  const today = toLocalDate(now, timeZone);
  const first = toLocalDate(occurredAtMs(allocations.at(-1)!), timeZone);
  const days = Math.max(1, daysBetween(first, today));
  const dailyPacePaise = divRound(saved, days, "floor");
  if (dailyPacePaise <= 0) return null;
  return {
    dailyPacePaise,
    reachedOn: addDays(today, divRound(remaining, dailyPacePaise, "ceil")),
  };
}
