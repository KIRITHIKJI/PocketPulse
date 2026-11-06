/**
 * Pocket-Money Survival Mode: the same safe-to-spend result, read as "how am I doing until my next
 * money arrives". It calculates no limit of its own, so the two screens can't disagree, and with
 * no next-income date it has no limit to show. The tone stays gentle: a plan, never a verdict.
 */
import { netSpending } from "./aggregation";
import type { Paise } from "./money";
import type { SafeToSpendResult } from "./safe-to-spend";
import {
  type Instant,
  type LocalDate,
  type TimeSettings,
  addDays,
  addMonths,
  daysBetween,
} from "./time";
import { resolvePeriod } from "./periods";
import type { Transaction } from "./schemas";

export const INCOME_FREQUENCIES = ["weekly", "biweekly", "monthly", "irregular", "none"] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];

/** The date one regular income period after `date`; null if money doesn't come in regularly. */
export function followingIncomeDate(date: LocalDate, frequency: IncomeFrequency): LocalDate | null {
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "monthly":
      return addMonths(date, 1);
    default:
      return null;
  }
}

/**
 * The next regular income date after `today`, from a date that has passed. Only ever offered for
 * the user to accept: a passed date is never rolled forward behind their back.
 */
export function proposedNextIncomeDate(
  passed: LocalDate,
  frequency: IncomeFrequency,
  today: LocalDate,
): LocalDate | null {
  let date = followingIncomeDate(passed, frequency);
  while (date !== null && date <= today) date = followingIncomeDate(date, frequency);
  return date;
}

function previousIncomeDate(next: LocalDate, frequency: IncomeFrequency): LocalDate | null {
  switch (frequency) {
    case "weekly":
      return addDays(next, -7);
    case "biweekly":
      return addDays(next, -14);
    case "monthly":
      return addMonths(next, -1);
    default:
      return null;
  }
}

export type SurvivalStatus = "needs_date" | "too_early" | "on_track" | "watch" | "at_risk";

interface IncomeCycle {
  startDate: LocalDate;
  nextIncomeDate: LocalDate;
  /** Today's place in the cycle: day 1 is the cycle's first day. */
  dayNumber: number;
  lengthDays: number;
  /** Net spending from the start of the cycle to now. */
  spentPaise: Paise;
  expectedIncomePaise: Paise | null;
}

interface SurvivalPlan {
  status: SurvivalStatus;
  headline: string;
  detail: string;
  daysLeft: number | null;
  dailyAllowancePaise: Paise | null;
  weeklyAllowancePaise: Paise | null;
  spentTodayPaise: Paise;
  /** Set only with a regular frequency, which is what says when this cycle began. */
  cycle: IncomeCycle | null;
}

export interface SurvivalInput {
  result: SafeToSpendResult;
  frequency: IncomeFrequency;
  expectedIncomePaise: Paise | null;
  ledger: readonly Transaction[];
  now: Instant;
  settings: TimeSettings;
  money: (paise: Paise) => string;
}

export function survivalPlan(input: SurvivalInput): SurvivalPlan {
  const { result, frequency, ledger, now, settings, money } = input;
  const spentTodayPaise = Math.max(
    0,
    netSpending(ledger, resolvePeriod({ kind: "today" }, now, settings)),
  );
  const daysLeft = result.daysUntilNextIncome;
  const daily = result.suggestedDailyPaise;
  const blank = {
    daysLeft,
    dailyAllowancePaise: daily,
    weeklyAllowancePaise: result.suggestedWeeklyPaise,
    spentTodayPaise,
  };

  if (result.status !== "ok" || daysLeft === null || daily === null) {
    return {
      ...blank,
      status: "needs_date",
      headline: "Add your next income date to start planning",
      detail: "A daily amount needs a date to count down to, so there isn’t one yet.",
      cycle: null,
    };
  }

  const nextIncomeDate = result.inputs.nextIncomeDate!;
  const startDate = previousIncomeDate(nextIncomeDate, frequency);
  let cycle: IncomeCycle | null = null;
  if (startDate !== null) {
    const elapsed = daysBetween(startDate, result.inputs.today);
    // A next date further away than one period means the cycle hasn't started yet.
    if (elapsed >= 0) {
      const period = resolvePeriod(
        { kind: "custom", from: startDate, to: result.inputs.today },
        now,
        settings,
      );
      cycle = {
        startDate,
        nextIncomeDate,
        dayNumber: elapsed + 1,
        lengthDays: daysBetween(startDate, nextIncomeDate),
        spentPaise: Math.max(0, netSpending(ledger, period)),
        expectedIncomePaise: input.expectedIncomePaise,
      };
    }
  }

  const days = `${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const pace = result.inputs.recentDailySpendingPaise;
  const plan = { ...blank, cycle };

  if (result.flexiblePaise <= 0) {
    return {
      ...plan,
      status: "at_risk",
      headline: "Things look tight until your next income",
      detail: `After savings, bills and your reserve, nothing flexible is left for the next ${days}. Releasing some savings or moving a bill could give you room.`,
    };
  }
  if (result.runOutInDays !== null && result.runOutInDays < daysLeft) {
    return {
      ...plan,
      status: "at_risk",
      headline: "Your money may run out a little early",
      detail: `At your recent ${money(pace ?? 0)} a day it would last about ${result.runOutInDays} day${result.runOutInDays === 1 ? "" : "s"}. Spending around ${money(daily)} a day would carry you the full ${days}.`,
    };
  }
  if (pace === null) {
    return {
      ...plan,
      status: "too_early",
      headline: `${money(daily)} a day gets you there`,
      detail: `That spreads your flexible money over ${days}. There’s no spending pace to compare with yet.`,
    };
  }
  if (spentTodayPaise > daily) {
    return {
      ...plan,
      status: "watch",
      headline: "A bigger day today, and that’s fine",
      detail: `You’ve spent ${money(spentTodayPaise)} today. You’re still on course: around ${money(daily)} a day from here covers the next ${days}.`,
    };
  }
  return {
    ...plan,
    status: "on_track",
    headline: "You’re on track",
    detail: `Your recent ${money(pace)} a day fits within ${money(daily)} a day for the next ${days}.`,
  };
}
