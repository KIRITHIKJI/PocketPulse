import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Info, Receipt } from "lucide-react";

import {
  BudgetSnapshot,
  GoalSnapshot,
  PlanFirstSteps,
  SafeToSpendLink,
} from "@/components/home/plan-snapshots";
import { OfflineFiguresNote } from "@/components/home/offline-figures-note";
import { PlayerChip, PlayerChipSkeleton } from "@/components/home/player-chip";
import { WaitingEntries } from "@/components/offline/waiting-entries";
import { StatePanel } from "@/components/states/state-panel";
import { AnimatedMoney } from "@/components/transactions/animated-money";
import { EntryCard } from "@/components/transactions/entry-list";
import { QuickAdd } from "@/components/transactions/quick-add";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  type TimeSettings,
  budgetAlert,
  evaluateBudget,
  frequentExpensesSince,
  goalProgress,
  indexById,
  moneyFormatter,
  netSpending,
  occurredAtMs,
  resolvePeriod,
  sumPaise,
  toLocalDate,
  transactionsInPeriod,
} from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import {
  getActiveGoals,
  getBudgets,
  getGoalLedger,
  getLatestExpense,
  getLedgerSince,
  getProfile,
  getQuickAddPresets,
  getRecentEntries,
  getReminderPreferences,
  getWalletBalances,
  withBudgetPeriods,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { earliestStart, isoInstant, mergeLedger, startForAnyZone } from "@/lib/data/slices";
import { entryView } from "@/lib/entry-view";
import { formatDayLabel, formatLocalDate, formatTimeOf } from "@/lib/format";
import { newestFirst } from "@/lib/history";
import { shortcutEntries, tileEntries } from "@/lib/quick-entries";

export const metadata: Metadata = { title: "Home" };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const RECENT = 5;

/**
 * Home (doc/DESIGN_PLAN.md §4): the tracked balance leads, logging comes second, then today and
 * this month, progress, plans and recent entries. On a phone the tiles are in the first screen.
 */
export default async function HomePage() {
  const now = requestNow();
  // The rows this screen's periods can need, whatever the profile's zone: today, this week and
  // this month (budgets), and the "frequent" look-back. Read alongside everything else.
  const periodsFor = (s: TimeSettings) =>
    (["today", "this_week", "this_month"] as const).map((kind) => resolvePeriod({ kind }, now, s));
  const since = earliestStart(startForAnyZone(periodsFor), frequentExpensesSince(now));
  const [
    kit,
    profile,
    window,
    latestExpense,
    goalLedger,
    balances,
    presets,
    budgets,
    goals,
    reminders,
  ] = await Promise.all([
    loadEntryKit(),
    getProfile(),
    getLedgerSince(isoInstant(since!)),
    getLatestExpense(),
    getGoalLedger(),
    getWalletBalances(isoInstant(now)),
    getQuickAddPresets(),
    getBudgets(),
    getActiveGoals(),
    getReminderPreferences(),
  ]);
  const ledger = await withBudgetPeriods(window, since!, budgets, now);
  const tz = profile.timeZone;
  const settings = { timeZone: tz, weekStartsOn: profile.weekStartsOn };
  const money = moneyFormatter(profile.currency);

  // Every figure below comes from the ledger through the domain layer; nothing is stored.
  const balance = balances.closing;
  const today = resolvePeriod({ kind: "today" }, now, settings);
  const month = resolvePeriod({ kind: "this_month" }, now, settings);
  const spentToday = netSpending(ledger, today);
  const spentMonth = netSpending(ledger, month);
  const incomeMonth = sumPaise(
    transactionsInPeriod(ledger, month)
      .filter((tx) => tx.type === "income")
      .map((tx) => tx.amountPaise),
  );
  const monthName = MONTHS[Number(month.startDate!.slice(5, 7)) - 1];

  // The newest entries are in the window, unless it holds fewer than five: only then read them.
  const inWindow = window.filter((tx) => occurredAtMs(tx) >= since!).length;
  const seen = inWindow >= RECENT ? ledger : mergeLedger(ledger, await getRecentEntries(RECENT));
  const ctx = {
    categoriesById: new Map(kit.categories.map((c) => [c.id, c])),
    accountsById: new Map(kit.accounts.map((a) => [a.id, a])),
    ledgerById: indexById(seen),
    currency: profile.currency,
  };
  const recent = [...seen].sort(newestFirst).slice(0, RECENT);

  const monthly = budgets.filter((b) => b.period === "monthly");
  const evaluate = (budget: (typeof budgets)[number]) =>
    evaluateBudget(budget, ledger, now, settings, undefined, money);
  const totalBudget = monthly.find((b) => b.categoryId === null);
  const budgetEval = totalBudget ? evaluate(totalBudget) : null;
  // The category budgets closest to their limit, so the snapshot shows what needs a look.
  const categoryEvals = monthly
    .filter((b) => b.categoryId !== null)
    .map(evaluate)
    .sort((a, b) => b.usedBp - a.usedBp)
    .slice(0, 2);
  const alertsOn = !reminders.allDisabled && reminders.budgetAlerts;
  const alertCount = alertsOn
    ? budgets.filter((budget) => budgetAlert(evaluate(budget)) !== null).length
    : 0;
  const categoryName = (id: string | null) =>
    kit.categories.find((c) => c.id === id)?.name ?? "Category";
  const goalCards = goals.slice(0, 2).map((goal) => ({
    goal,
    progress: goalProgress(goal, goalLedger, kit.today, "weekly", money),
  }));
  const untracked = balance.untrackedAccountIds.length;
  const tiles = tileEntries(presets, kit.categories);

  return (
    <>
      <div className="flex flex-col gap-0.5">
        <h1 className="type-title">Home</h1>
        <p className="type-caption text-muted-foreground">{formatLocalDate(today.startDate!)}</p>
      </div>
      <OfflineFiguresNote />
      <WaitingEntries currency={profile.currency} />

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        {/* On phones both columns dissolve into one ordered list: balance, tiles, progress, plans,
            then recent entries. */}
        <div className="contents lg:col-span-8 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <Surface
            variant="hero"
            aria-label="Balance and spending"
            role="region"
            className="order-1"
          >
            <div className="flex flex-col gap-1">
              <h2 className="type-caption text-muted-foreground">
                Tracked balance · all wallets · now
              </h2>
              <AnimatedMoney
                paise={balance.balancePaise}
                currency={profile.currency}
                className="type-display money"
                data-testid="home-balance"
              />
              <p className="flex gap-1.5 type-caption text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  Opening balances plus what you’ve recorded, not a bank balance.
                  {untracked > 0 &&
                    ` ${untracked} wallet${untracked === 1 ? " starts" : "s start"} tracking later.`}
                </span>
              </p>
            </div>
            {!profile.onboardingCompletedAt && (
              <div
                className="flex flex-wrap items-center gap-3 rounded-xl bg-primary-soft p-3"
                data-testid="finish-setup"
              >
                <p className="min-w-0 flex-1 type-body">
                  Add your starting balance so this figure starts from the right number.
                </p>
                <Button size="sm" asChild>
                  <Link href="/onboarding">Add starting balance</Link>
                </Button>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 border-t pt-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="type-caption text-muted-foreground">Spent today</dt>
                <dd>
                  <AnimatedMoney
                    paise={spentToday}
                    currency={profile.currency}
                    className="type-title money"
                    data-testid="home-spent-today"
                  />
                </dd>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <dt className="type-caption text-muted-foreground">Spent in {monthName}</dt>
                <dd>
                  <AnimatedMoney
                    paise={spentMonth}
                    currency={profile.currency}
                    className="type-title money"
                    data-testid="home-spent-month"
                  />
                </dd>
              </div>
            </dl>
            <p className="-mt-1 type-caption text-muted-foreground">
              Expenses minus refunds.
              {incomeMonth > 0 ? (
                <>
                  {" "}
                  Income this month: <span className="money">{money(incomeMonth)}</span>.
                </>
              ) : null}
            </p>
          </Surface>

          <section aria-labelledby="quick-add-heading" className="order-2 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="quick-add-heading" className="type-body font-semibold">
                Quick add
              </h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/add?tab=edit">
                  Edit tiles
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            {tiles.length > 0 ? (
              <QuickAdd
                kit={kit}
                tiles={tiles}
                shortcuts={shortcutEntries(mergeLedger(ledger, latestExpense), kit.categories, now)}
                showRoutes
              />
            ) : (
              <Surface>
                <StatePanel
                  size="section"
                  title="All tiles are hidden"
                  description="Show a tile again, or add your own."
                  actions={
                    <Button size="sm" variant="outline" asChild>
                      <Link href="/add?tab=edit">Edit tiles</Link>
                    </Button>
                  }
                />
              </Surface>
            )}
          </section>

          <Surface className="order-6 min-w-0">
            <SurfaceHeader
              title="Recent"
              action={
                recent.length > 0 && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/transactions">
                      All transactions
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                )
              }
            />
            {recent.length === 0 ? (
              <StatePanel
                size="section"
                icon={Receipt}
                title="Nothing recorded yet"
                description="Tap a tile above. Your first entry shows up here."
              />
            ) : (
              <ul className="-mx-2 flex flex-col" data-testid="recent-entries">
                {recent.map((tx) => (
                  <EntryCard
                    key={tx.id}
                    entry={{
                      ...entryView(tx, ctx),
                      timeLabel: `${formatDayLabel(toLocalDate(occurredAtMs(tx), tz), kit.today)}, ${formatTimeOf(tx.occurredAt, tz)}`,
                    }}
                  />
                ))}
              </ul>
            )}
          </Surface>
        </div>

        <div className="contents lg:col-span-4 lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
          <div className="order-3">
            <Suspense fallback={<PlayerChipSkeleton />}>
              <PlayerChip />
            </Suspense>
          </div>
          {budgets.length === 0 && goals.length === 0 ? (
            <div className="order-4">
              <PlanFirstSteps />
            </div>
          ) : (
            <div className="order-4 flex flex-col gap-4 lg:gap-6">
              <BudgetSnapshot
                alertCount={alertCount}
                budgetEval={budgetEval}
                categoryEvals={categoryEvals}
                hasBudgets={budgets.length > 0}
                categoryName={categoryName}
                money={money}
              />
              <GoalSnapshot goalCards={goalCards} money={money} />
            </div>
          )}
          <div className="order-5">
            <SafeToSpendLink />
          </div>
        </div>
      </div>
    </>
  );
}
