/**
 * Safe-to-spend / Pocket-Money Survival planning model.
 *
 *   flexible = consolidated tracked balance (now)
 *            − money set aside for savings goals
 *            − unpaid commitments due on or before the horizon end
 *            − optional minimum reserve
 *
 * - Paid expenses are already inside the balance, so they are never subtracted again.
 * - A commitment counts as paid once it links to an active transaction (`paidTransactionId`),
 *   so the same bill is never both an expense and an unpaid commitment. If that payment is
 *   deleted, the commitment is unpaid again.
 * - The horizon ends on the next income date unless the user picks another end date.
 * - Without a next income date there is no honest daily limit: the result says "not enough
 *   info" and leaves the daily/weekly limits null instead of inventing them.
 * Every result returns its inputs and plain-language explanation lines.
 */
import { netSpending } from "./aggregation";
import { type ConsolidatedBalance, consolidatedBalanceAt, trackingStartMs } from "./balances";
import { forecastCommitments } from "./recurring";
import { indexById, isActive } from "./ledger";
import {
  divRound,
  formatINR,
  maxPaise,
  minPaise,
  multiplyPaise,
  subtractPaise,
  sumPaise,
  type Paise,
} from "./money";
import { totalEarmarked } from "./savings";
import type { Account, Transaction } from "./schemas";
import type { Commitment, RecurringTemplate } from "./plan-schemas";
import {
  DEFAULT_TIME_SETTINGS,
  type Instant,
  type LocalDate,
  type TimeSettings,
  addDays,
  daysBetween,
  toLocalDate,
} from "./time";
import { resolvePeriod } from "./periods";

interface SafeToSpendInput {
  accounts: readonly Account[];
  ledger: readonly Transaction[];
  /**
   * The tracked balance at `now`, from `wallet_balances`. Without it the balance is rebuilt from
   * `ledger`, which then has to hold every row; with it, `ledger` needs goal money, the paid and
   * recurring entries, and the recent days only.
   */
  balance?: ConsolidatedBalance;
  commitments: readonly Commitment[];
  now: Instant;
  settings?: TimeSettings;
  nextIncomeDate: LocalDate | null;
  /** Overrides the horizon end (defaults to the next income date). Inclusive. */
  horizonEndDate?: LocalDate | null;
  reservePaise?: Paise;
  /** Complete days of recent spending used for the pace estimate (default 14). */
  paceLookbackDays?: number;
  /** How explanations write money and dates (the profile's currency, a readable date). */
  money?: (paise: Paise) => string;
  dateText?: (date: LocalDate) => string;
}

export type MissingInfo = "next_income_date" | "next_income_date_passed";

export interface SafeToSpendResult {
  status: "ok" | "not_enough_info";
  missing: MissingInfo[];
  inputs: {
    today: LocalDate;
    balancePaise: Paise;
    earmarkedPaise: Paise;
    commitmentsDuePaise: Paise;
    reservePaise: Paise;
    nextIncomeDate: LocalDate | null;
    horizonEndDate: LocalDate | null;
    /** The unpaid commitments that were subtracted. */
    commitmentIds: string[];
    /** Average daily net spending over the lookback window; null without enough history. */
    recentDailySpendingPaise: Paise | null;
    paceLookbackDays: number;
  };
  flexiblePaise: Paise;
  /** Days from today until the next income (today counts, the income day doesn't). */
  daysUntilNextIncome: number | null;
  suggestedDailyPaise: Paise | null;
  suggestedWeeklyPaise: Paise | null;
  /** Tracked balance just before the next income arrives, under `endBalanceAssumption`. */
  expectedEndBalancePaise: Paise | null;
  endBalanceAssumption: string | null;
  /** At recent pace, whole days until flexible money runs out; null if pace unknown or zero. */
  runOutInDays: number | null;
  warnings: string[];
  explanation: string[];
}

function isCommitmentPaid(commitment: Commitment, byId: ReadonlyMap<string, Transaction>): boolean {
  if (!commitment.paidTransactionId) return false;
  const tx = byId.get(commitment.paidTransactionId);
  return tx !== undefined && isActive(tx);
}

/** Unpaid, uncancelled commitments due on or before `horizonEnd` (all of them when null). */
export function unpaidCommitmentsDue(
  commitments: readonly Commitment[],
  ledger: readonly Transaction[],
  horizonEnd: LocalDate | null,
): Commitment[] {
  const byId = indexById(ledger);
  return commitments.filter(
    (c) =>
      c.cancelledAt === null &&
      !isCommitmentPaid(c, byId) &&
      (horizonEnd === null || c.dueDate <= horizonEnd),
  );
}

export function calculateSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const settings = input.settings ?? DEFAULT_TIME_SETTINGS;
  const tz = settings.timeZone;
  const today = toLocalDate(input.now, tz);
  const reservePaise = input.reservePaise ?? 0;
  const lookback = input.paceLookbackDays ?? 14;
  const money = input.money ?? formatINR;
  const dateText = input.dateText ?? ((date: LocalDate) => date);

  if (input.balance && input.balance.asOfMs !== input.now) {
    throw new Error("The balance was taken at a different instant from this plan's");
  }
  const balancePaise = (
    input.balance ?? consolidatedBalanceAt(input.accounts, input.ledger, input.now, tz)
  ).balancePaise;
  const earmarkedPaise = totalEarmarked(input.ledger, input.now);

  const missing: MissingInfo[] = [];
  if (!input.nextIncomeDate) missing.push("next_income_date");
  else if (input.nextIncomeDate <= today) missing.push("next_income_date_passed");

  const horizonEndDate =
    input.horizonEndDate ?? (missing.length === 0 ? input.nextIncomeDate : null);
  const due = unpaidCommitmentsDue(input.commitments, input.ledger, horizonEndDate);
  const commitmentsDuePaise = sumPaise(due.map((c) => c.amountPaise));
  const flexiblePaise = subtractPaise(
    subtractPaise(subtractPaise(balancePaise, earmarkedPaise), commitmentsDuePaise),
    reservePaise,
  );

  // Recent pace: complete days before today, never reaching back before tracking started.
  const earliestTracking = input.accounts.length
    ? Math.min(...input.accounts.map((a) => trackingStartMs(a, tz)))
    : null;
  let paceDays = lookback;
  if (earliestTracking !== null) {
    paceDays = Math.min(lookback, daysBetween(toLocalDate(earliestTracking, tz), today));
  }
  let recentDailySpendingPaise: Paise | null = null;
  if (paceDays > 0 && earliestTracking !== null) {
    const window = resolvePeriod(
      { kind: "custom", from: addDays(today, -paceDays), to: addDays(today, -1) },
      input.now,
      settings,
    );
    recentDailySpendingPaise = maxPaise(0, divRound(netSpending(input.ledger, window), paceDays));
  }

  const daysUntilNextIncome =
    missing.length === 0 ? daysBetween(today, input.nextIncomeDate!) : null;

  let suggestedDailyPaise: Paise | null = null;
  let suggestedWeeklyPaise: Paise | null = null;
  let expectedEndBalancePaise: Paise | null = null;
  let endBalanceAssumption: string | null = null;
  let runOutInDays: number | null = null;
  const warnings: string[] = [];

  if (daysUntilNextIncome !== null) {
    suggestedDailyPaise =
      flexiblePaise > 0 ? divRound(flexiblePaise, daysUntilNextIncome, "floor") : 0;
    suggestedWeeklyPaise = minPaise(
      multiplyPaise(suggestedDailyPaise, Math.min(7, daysUntilNextIncome)),
      maxPaise(0, flexiblePaise),
    );
    const afterCommitments = subtractPaise(balancePaise, commitmentsDuePaise);
    if (recentDailySpendingPaise !== null) {
      expectedEndBalancePaise = subtractPaise(
        afterCommitments,
        multiplyPaise(recentDailySpendingPaise, daysUntilNextIncome),
      );
      endBalanceAssumption = `Assumes you keep spending about ${money(recentDailySpendingPaise)} a day (your average over the last ${paceDays} day${paceDays === 1 ? "" : "s"}) and pay the listed commitments.`;
    } else {
      expectedEndBalancePaise = subtractPaise(
        afterCommitments,
        multiplyPaise(suggestedDailyPaise, daysUntilNextIncome),
      );
      endBalanceAssumption = `Not enough history for a spending pace yet; assumes you spend exactly the suggested ${money(suggestedDailyPaise)} a day and pay the listed commitments.`;
    }
    if (recentDailySpendingPaise !== null && recentDailySpendingPaise > 0) {
      runOutInDays =
        flexiblePaise > 0 ? divRound(flexiblePaise, recentDailySpendingPaise, "floor") : 0;
      if (runOutInDays < daysUntilNextIncome) {
        warnings.push(
          `At your recent pace of ${money(recentDailySpendingPaise)} a day, flexible money would last about ${runOutInDays} day${runOutInDays === 1 ? "" : "s"}, but your next income is ${daysUntilNextIncome} day${daysUntilNextIncome === 1 ? "" : "s"} away.`,
        );
      }
    }
  }
  if (flexiblePaise < 0) {
    warnings.push(
      "Savings set aside, commitments and your reserve add up to more than your tracked balance. Consider releasing some savings or revisiting commitments.",
    );
  }
  const overdue = due.filter((c) => c.dueDate < today);
  if (overdue.length) {
    warnings.push(
      `${overdue.length} commitment${overdue.length === 1 ? " is" : "s are"} past due and still unpaid; ${overdue.length === 1 ? "it is" : "they are"} included above. Mark ${overdue.length === 1 ? "it" : "them"} paid or cancelled if that has changed.`,
    );
  }

  const horizonText = horizonEndDate ? `due by ${dateText(horizonEndDate)}` : "with any due date";
  const explanation = [
    `Tracked balance now: ${money(balancePaise)} (only what you've recorded, not a verified bank balance).`,
    `Set aside for savings goals: −${money(earmarkedPaise)}.`,
    `Unpaid commitments ${horizonText}: −${money(commitmentsDuePaise)} (${due.length} item${due.length === 1 ? "" : "s"}; already-paid bills are in your balance and aren't subtracted again).`,
  ];
  if (reservePaise) explanation.push(`Minimum reserve you chose to keep: −${money(reservePaise)}.`);
  explanation.push(`Flexible money: ${money(flexiblePaise)}.`);
  if (daysUntilNextIncome !== null && suggestedDailyPaise !== null) {
    explanation.push(
      `Spread over ${daysUntilNextIncome} day${daysUntilNextIncome === 1 ? "" : "s"} until your next income on ${dateText(input.nextIncomeDate!)}: up to ${money(suggestedDailyPaise)} a day. This is an estimate, not a guarantee.`,
    );
  } else if (missing.includes("next_income_date")) {
    explanation.push("Add your next allowance or income date to get a daily and weekly limit.");
  } else {
    explanation.push(
      `Your next income date (${dateText(input.nextIncomeDate!)}) is today or has passed. Update it to get a daily and weekly limit.`,
    );
  }

  return {
    status: missing.length ? "not_enough_info" : "ok",
    missing,
    inputs: {
      today,
      balancePaise,
      earmarkedPaise,
      commitmentsDuePaise,
      reservePaise,
      nextIncomeDate: input.nextIncomeDate,
      horizonEndDate,
      commitmentIds: due.map((c) => c.id),
      recentDailySpendingPaise,
      paceLookbackDays: paceDays,
    },
    flexiblePaise,
    daysUntilNextIncome,
    suggestedDailyPaise,
    suggestedWeeklyPaise,
    expectedEndBalancePaise,
    endBalanceAssumption,
    runOutInDays,
    warnings,
    explanation,
  };
}

/** How far ahead recurring bills are forecast when there's no income date to plan up to. */
const NO_DATE_HORIZON_DAYS = 30;

interface SafeToSpendPlanInput extends Omit<SafeToSpendInput, "horizonEndDate"> {
  templates: readonly RecurringTemplate[];
}

/**
 * Safe-to-spend from everything planned: saved bills plus the recurring expenses due within the
 * horizon, as one list. Both Safe-to-spend and Survival Mode call this, so they can't disagree.
 * The horizon is the next income date; without a usable one it's the next 30 days, and the limits
 * stay null. Skip markers are cancelled rows, so they only hide an occurrence from the forecast.
 */
export function calculatePlan(input: SafeToSpendPlanInput): SafeToSpendResult {
  const { templates, ...rest } = input;
  const settings = rest.settings ?? DEFAULT_TIME_SETTINGS;
  const today = toLocalDate(rest.now, settings.timeZone);
  const usableDate = rest.nextIncomeDate !== null && rest.nextIncomeDate > today;
  const horizon = usableDate ? rest.nextIncomeDate! : addDays(today, NO_DATE_HORIZON_DAYS);
  return calculateSafeToSpend({
    ...rest,
    commitments: [
      ...rest.commitments,
      ...forecastCommitments(templates, rest.ledger, rest.commitments, horizon),
    ],
    horizonEndDate: horizon,
  });
}
