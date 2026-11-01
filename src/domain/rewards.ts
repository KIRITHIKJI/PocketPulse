/**
 * Rewards. XP is for logging, categorising, reviewing and saving; nothing here looks at how much
 * was spent, and an expense is never penalised.
 *
 * Every award has a stable `sourceKey` that says what earned it ("logged_day:2026-11-01"), and the
 * database keeps one row per key. So awards are idempotent by construction: working them out again
 * changes nothing, adding and deleting entries can't earn a day twice, and editing or deleting an
 * entry later takes nothing away. A day counts by when the entry was logged (`createdAt`), not the
 * date on it, so backdating entries can't fill in a streak.
 */
import { netSpending, spendingEntries } from "./aggregation";
import { isActive, occurredAtMs } from "./ledger";
import { divRound } from "./money";
import type { Budget, SavingsGoal, Transaction } from "./schemas";
import {
  type Instant,
  type LocalDate,
  type TimeSettings,
  addDays,
  addMonths,
  daysBetween,
  parseInstant,
  resolvePeriod,
  startOfMonth,
  startOfWeek,
  toLocalDate,
} from "./time";

export const XP = {
  loggedDay: 10,
  cleanWeek: 15,
  savedWeek: 10,
  budgetMonth: 25,
  weeklyReview: 10,
} as const;

/** "Explored the transactions behind 5 insights." */
export const DETECTIVE_INSIGHTS = 5;
export const FIRST_ENTRIES = 10;
export const STREAK_DAYS = 7;
/** A week or month with almost nothing logged says nothing, so these need some real activity. */
const MIN_EXPENSES_CLEAN_WEEK = 3;
const MIN_EXPENSES_BUDGET_MONTH = 5;

export const OPT_OUT_PERIOD = "opt-out";

export interface RewardEvent {
  kind: string;
  xp: number;
  sourceKey: string;
}

export interface QuestDefinition {
  code: string;
  title: string;
  description: string;
  cadence: "daily" | "weekly" | "once";
  target: number;
  xp: number;
}

export interface AchievementDefinition {
  code: string;
  title: string;
  description: string;
  xp: number;
  icon: string | null;
}

export interface QuestProgress {
  code: string;
  periodKey: string;
  progress: number;
  target: number;
  complete: boolean;
}

/** What already happened outside the ledger, from stored events. */
export interface RewardFacts {
  /** Week starts the user marked as reviewed. */
  reviewedWeeks: readonly LocalDate[];
  /** Distinct insights whose entries were opened. */
  insightsExplored: number;
  optedOutQuests: readonly string[];
  /** Days already awarded. They stay logged even if the entries behind them are deleted. */
  awardedDays: readonly LocalDate[];
}

export interface RewardInput extends RewardFacts {
  ledger: readonly Transaction[];
  goals: readonly SavingsGoal[];
  /** Budgets with when each was made: one set up after a month ended can't score that month. */
  budgets: readonly (Budget & { createdAt: string | null })[];
  achievements: readonly AchievementDefinition[];
  quests: readonly QuestDefinition[];
  now: Instant;
  settings: TimeSettings;
}

export interface RewardResult {
  events: RewardEvent[];
  achievementCodes: string[];
  quests: QuestProgress[];
  loggedDays: LocalDate[];
}

const isLoggedEntry = (tx: Transaction) =>
  isActive(tx) && tx.type !== "allocation" && tx.type !== "allocation_release";

/** Local days something was logged on, sorted. */
export function loggedDays(ledger: readonly Transaction[], timeZone: string): LocalDate[] {
  const days = new Set<LocalDate>();
  for (const tx of ledger) {
    if (isLoggedEntry(tx)) days.add(toLocalDate(parseInstant(tx.createdAt), timeZone));
  }
  return [...days].sort();
}

export interface Streaks {
  currentDaily: number;
  longestDaily: number;
  lastLoggedDate: LocalDate | null;
  currentWeekly: number;
  longestWeekly: number;
  lastLoggedWeek: LocalDate | null;
}

function runs(sorted: readonly LocalDate[], step: number) {
  let longest = 0;
  let run = 0;
  sorted.forEach((date, i) => {
    run = i > 0 && daysBetween(sorted[i - 1]!, date) === step ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return { longest, run };
}

/**
 * Daily and weekly runs. A streak stays current until a whole day or week has passed without
 * logging, so not having logged yet today never reads as a broken streak.
 */
export function calculateStreaks(
  days: readonly LocalDate[],
  today: LocalDate,
  settings: TimeSettings,
): Streaks {
  const sorted = [...new Set(days)].sort();
  const daily = runs(sorted, 1);
  const last = sorted.at(-1) ?? null;
  const weeks = [...new Set(sorted.map((d) => startOfWeek(d, settings.weekStartsOn)))].sort();
  const weekly = runs(weeks, 7);
  const lastWeek = weeks.at(-1) ?? null;
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  return {
    currentDaily: last !== null && daysBetween(last, today) <= 1 ? daily.run : 0,
    longestDaily: daily.longest,
    lastLoggedDate: last,
    currentWeekly: lastWeek !== null && daysBetween(lastWeek, thisWeek) <= 7 ? weekly.run : 0,
    longestWeekly: weekly.longest,
    lastLoggedWeek: lastWeek,
  };
}

export interface Level {
  level: number;
  /** XP this level started at. */
  floorXp: number;
  nextLevelXp: number;
  progressBp: number;
}

/** Level n starts at 50·n·(n−1) XP, so each level takes 100 XP more than the one before. */
export function levelFor(totalXp: number): Level {
  const xp = Math.max(0, totalXp);
  let level = 1;
  while (50 * (level + 1) * level <= xp) level += 1;
  const floorXp = 50 * level * (level - 1);
  const nextLevelXp = 50 * (level + 1) * level;
  return {
    level,
    floorXp,
    nextLevelXp,
    progressBp: divRound((xp - floorXp) * 10_000, nextLevelXp - floorXp, "floor"),
  };
}

function expensesByWeek(input: RewardInput) {
  const tz = input.settings.timeZone;
  const weeks = new Map<LocalDate, { total: number; unassigned: number }>();
  for (const tx of input.ledger) {
    if (tx.type !== "expense" || !isActive(tx)) continue;
    const week = startOfWeek(toLocalDate(occurredAtMs(tx), tz), input.settings.weekStartsOn);
    const entry = weeks.get(week) ?? { total: 0, unassigned: 0 };
    entry.total += 1;
    if (!tx.categoryId) entry.unassigned += 1;
    weeks.set(week, entry);
  }
  return weeks;
}

function budgetMonths(input: RewardInput, today: LocalDate): LocalDate[] {
  const { settings, ledger, budgets, now } = input;
  const thisMonth = startOfMonth(today);
  const totals = budgets.filter(
    (b) => b.categoryId === null && b.period === "monthly" && b.createdAt !== null,
  );
  const expenses = ledger.flatMap((tx) =>
    tx.type === "expense" && isActive(tx)
      ? [startOfMonth(toLocalDate(occurredAtMs(tx), settings.timeZone))]
      : [],
  );
  const months: LocalDate[] = [];
  for (const month of new Set(expenses)) {
    if (month >= thisMonth) continue;
    const period = resolvePeriod(
      { kind: "custom", from: month, to: addDays(addMonths(month, 1), -1) },
      now,
      settings,
    );
    const count = spendingEntries(ledger, period).filter((e) => e.tx.type === "expense").length;
    if (count < MIN_EXPENSES_BUDGET_MONTH) continue;
    const net = netSpending(ledger, period);
    const met = totals.some(
      (b) => parseInstant(b.createdAt!) < period.endMs! && net <= b.limitPaise,
    );
    if (met) months.push(month);
  }
  return months.sort();
}

/**
 * Everything earned so far. Pure and repeatable: the same data gives the same keys, and the caller
 * stores only keys it hasn't seen, so running this twice awards nothing twice.
 */
export function calculateRewards(input: RewardInput): RewardResult {
  const { ledger, goals, settings, now } = input;
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  const thisWeek = startOfWeek(today, settings.weekStartsOn);
  const events: RewardEvent[] = [];
  const add = (kind: string, xp: number, sourceKey: string) => events.push({ kind, xp, sourceKey });

  const days = [...new Set([...input.awardedDays, ...loggedDays(ledger, tz)])].sort();
  for (const day of days) add("logged_day", XP.loggedDay, `logged_day:${day}`);

  const weeks = expensesByWeek(input);
  const cleanWeeks = [...weeks].filter(
    ([week, w]) => week < thisWeek && w.total >= MIN_EXPENSES_CLEAN_WEEK && w.unassigned === 0,
  );
  for (const [week] of cleanWeeks) add("clean_week", XP.cleanWeek, `clean_week:${week}`);

  const allocations = ledger.filter((tx) => tx.type === "allocation" && isActive(tx));
  for (const week of new Set(
    allocations.map((tx) => startOfWeek(toLocalDate(occurredAtMs(tx), tz), settings.weekStartsOn)),
  )) {
    add("saved_week", XP.savedWeek, `saved_week:${week}`);
  }

  const months = budgetMonths(input, today);
  for (const month of months)
    add("budget_month", XP.budgetMonth, `budget_month:${month.slice(0, 7)}`);

  for (const week of input.reviewedWeeks) {
    add("weekly_review", XP.weeklyReview, `weekly_review:${week}`);
  }

  const entryCount = ledger.filter(isLoggedEntry).length;
  const longest = calculateStreaks(days, today, settings).longestDaily;
  const earned: Record<string, boolean> = {
    first_10_transactions: entryCount >= FIRST_ENTRIES,
    streak_7_day: longest >= STREAK_DAYS,
    no_mystery_money: cleanWeeks.length > 0,
    first_savings_goal: allocations.length > 0,
    monthly_budget_achieved: months.length > 0,
    spending_detective: input.insightsExplored >= DETECTIVE_INSIGHTS,
    weekly_review_complete: input.reviewedWeeks.length > 0,
  };
  const achievementCodes = input.achievements.filter((a) => earned[a.code]).map((a) => a.code);
  for (const a of input.achievements) {
    if (earned[a.code]) add("achievement", a.xp, `achievement:${a.code}`);
  }

  const week = weeks.get(thisWeek);
  const facts: Record<string, { periodKey: string; progress: number }> = {
    log_today: { periodKey: today, progress: days.includes(today) ? 1 : 0 },
    categorise_week: {
      periodKey: thisWeek,
      progress: week && week.total > 0 && week.unassigned === 0 ? 1 : 0,
    },
    weekly_review: {
      periodKey: thisWeek,
      progress: input.reviewedWeeks.includes(thisWeek) ? 1 : 0,
    },
    set_a_goal: { periodKey: "once", progress: goals.length > 0 ? 1 : 0 },
  };
  const quests: QuestProgress[] = [];
  for (const quest of input.quests) {
    const fact = facts[quest.code];
    if (!fact || input.optedOutQuests.includes(quest.code)) continue;
    const complete = fact.progress >= quest.target;
    quests.push({ code: quest.code, target: quest.target, complete, ...fact });
    if (complete) add("quest", quest.xp, `quest:${quest.code}:${fact.periodKey}`);
  }

  return { events, achievementCodes, quests, loggedDays: days };
}

/** Sums non-revoked XP. Stored events, not current entries: rewards don't shrink with an edit. */
export function totalXp(events: readonly { xp: number; revokedAt?: string | null }[]): number {
  return events.reduce((sum, e) => (e.revokedAt ? sum : sum + e.xp), 0);
}
