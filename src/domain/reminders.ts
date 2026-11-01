/**
 * Which reminders are due now. Pure: the caller stores what this returns, and each has a stable
 * `dedupeKey`, so a reminder is created once however often this runs. Everything is off unless the
 * user turned it on, "turn off all" beats every other choice, and the wording stays calm: a
 * reminder never says anyone did badly.
 */
import { budgetAlert, evaluateBudget } from "./budgets";
import { formatBasisPoints, type Paise } from "./money";
import { loggedDays } from "./rewards";
import type { Budget, Commitment, RecurringTemplate, SavingsGoal, Transaction } from "./schemas";
import { forecastCommitments } from "./recurring";
import { unpaidCommitmentsDue } from "./safe-to-spend";
import {
  type Instant,
  type LocalDate,
  type TimeSettings,
  addDays,
  daysBetween,
  startOfWeek,
  toLocalDate,
  toLocalTime,
  weekdayOf,
} from "./time";

export const REMINDER_DAY_CHOICES = ["daily", "weekdays"] as const;
export const SAVINGS_REVIEW_CHOICES = ["weekly", "monthly"] as const;

export interface ReminderSettings {
  allDisabled: boolean;
  missedLogging: boolean;
  /** "HH:MM" local; nothing before this time. */
  missedLoggingTime: string;
  missedLoggingDays: (typeof REMINDER_DAY_CHOICES)[number];
  weeklyReview: boolean;
  weeklyReviewDay: number;
  upcomingIncome: boolean;
  upcomingIncomeDays: number;
  budgetAlerts: boolean;
  upcomingCommitments: boolean;
  upcomingCommitmentDays: number;
  savingsReview: boolean;
  savingsReviewFrequency: (typeof SAVINGS_REVIEW_CHOICES)[number];
}

export type ReminderKind =
  | "missed_logging"
  | "weekly_review"
  | "upcoming_income"
  | "budget_threshold"
  | "upcoming_commitment"
  | "savings_review";

export interface DueReminder {
  kind: ReminderKind;
  title: string;
  body: string;
  linkPath: string;
  dedupeKey: string;
}

export interface ReminderInput {
  prefs: ReminderSettings;
  ledger: readonly Transaction[];
  budgets: readonly Budget[];
  commitments: readonly Commitment[];
  templates: readonly RecurringTemplate[];
  goals: readonly SavingsGoal[];
  nextIncomeDate: LocalDate | null;
  now: Instant;
  settings: TimeSettings;
  money: (paise: Paise) => string;
  dateText: (date: LocalDate) => string;
}

export function dueReminders(input: ReminderInput): DueReminder[] {
  const { prefs, ledger, now, settings, money, dateText } = input;
  if (prefs.allDisabled) return [];
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  const weekStart = startOfWeek(today, settings.weekStartsOn);
  const due: DueReminder[] = [];

  if (prefs.missedLogging) {
    const weekday = weekdayOf(today);
    const onThisDay = prefs.missedLoggingDays === "daily" || (weekday !== 0 && weekday !== 6);
    if (
      onThisDay &&
      toLocalTime(now, tz) >= prefs.missedLoggingTime &&
      !loggedDays(ledger, tz).includes(today)
    ) {
      due.push({
        kind: "missed_logging",
        title: "Anything to log today?",
        body: "If you bought something today, it only takes a second to add it.",
        linkPath: "/add",
        dedupeKey: `missed:${today}`,
      });
    }
  }

  if (prefs.weeklyReview && weekdayOf(today) === prefs.weeklyReviewDay) {
    due.push({
      kind: "weekly_review",
      title: "Your weekly review is ready",
      body: "A quick look at where this week’s money went.",
      linkPath: "/insights?period=this_week",
      dedupeKey: `review:${weekStart}`,
    });
  }

  if (prefs.upcomingIncome && input.nextIncomeDate && input.nextIncomeDate >= today) {
    const days = daysBetween(today, input.nextIncomeDate);
    if (days <= prefs.upcomingIncomeDays) {
      due.push({
        kind: "upcoming_income",
        title: "Your allowance is coming up",
        body: `Expected ${dateText(input.nextIncomeDate)}. Nothing counts until you record it.`,
        linkPath: "/safe-to-spend",
        dedupeKey: `income:${input.nextIncomeDate}`,
      });
    }
  }

  if (prefs.budgetAlerts) {
    for (const budget of input.budgets) {
      const evaluation = evaluateBudget(budget, ledger, now, settings, undefined, money);
      const alert = budgetAlert(evaluation);
      if (!alert) continue;
      due.push({
        kind: "budget_threshold",
        title: alert.exceeded ? "A budget is over its target" : "A budget is getting close",
        body: `You’ve used ${formatBasisPoints(alert.usedBp, 0)} of it. Nothing is blocked; a budget is a target.`,
        linkPath: "/budgets",
        dedupeKey: `budget:${budget.id}:${evaluation.period.startDate}:${alert.thresholdBp}`,
      });
    }
  }

  if (prefs.upcomingCommitments) {
    const until = addDays(today, prefs.upcomingCommitmentDays);
    const bills = unpaidCommitmentsDue(
      [
        ...input.commitments,
        ...forecastCommitments(input.templates, ledger, input.commitments, until),
      ],
      ledger,
      until,
    ).filter((bill) => bill.dueDate >= today);
    for (const bill of bills) {
      due.push({
        kind: "upcoming_commitment",
        title: `${bill.title} is coming up`,
        body: `${money(bill.amountPaise)} due ${dateText(bill.dueDate)}.`,
        linkPath: "/recurring",
        dedupeKey: `bill:${bill.id}:${bill.dueDate}`,
      });
    }
  }

  if (prefs.savingsReview && input.goals.some((goal) => goal.status === "active")) {
    const period = prefs.savingsReviewFrequency === "weekly" ? weekStart : today.slice(0, 7);
    due.push({
      kind: "savings_review",
      title: "A moment for your savings goals",
      body: "See how your goals are coming along.",
      linkPath: "/goals",
      dedupeKey: `savings:${period}`,
    });
  }
  return due;
}
