import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, ListChecks, Receipt } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { BudgetSnapshot, GoalSnapshot } from "@/components/home/plan-snapshots";
import { WaitingEntries } from "@/components/offline/waiting-entries";
import { AnimatedMoney } from "@/components/transactions/animated-money";
import { EntryCard } from "@/components/transactions/entry-list";
import { QuickAdd } from "@/components/transactions/quick-add";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  return (
    <>
      <PageHeader
        title="Home"
        description="Your tracked balance, today’s spending, budgets and goals at a glance."
      />
      <WaitingEntries currency={profile.currency} />

      {!profile.onboardingCompletedAt && (
        <Card className="flex-row flex-wrap items-center gap-3" data-testid="finish-setup">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <ListChecks className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="font-semibold">Finish setting up</h2>
            <p className="text-sm text-muted-foreground">
              Add your opening balance so your tracked balance starts from the right number.
            </p>
          </div>
          <Button asChild>
            <Link href="/onboarding">Continue setup</Link>
          </Button>
        </Card>
      )}

      <section aria-label="Balance and spending" className="grid gap-3 md:grid-cols-3">
        <Card className="gap-1 md:col-span-3 lg:col-span-1">
          <h2 className="text-sm text-muted-foreground">Tracked balance · all wallets · now</h2>
          <AnimatedMoney
            paise={balance.balancePaise}
            currency={profile.currency}
            className="tabular text-4xl font-semibold tracking-tight"
            data-testid="home-balance"
          />
          <p className="mt-1 flex gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Opening balances plus what you’ve recorded — not a bank balance.
            {balance.untrackedAccountIds.length > 0 &&
              ` ${balance.untrackedAccountIds.length} wallet${balance.untrackedAccountIds.length === 1 ? " starts" : "s start"} tracking later.`}
          </p>
        </Card>
        <Card className="gap-1">
          <h2 className="text-sm text-muted-foreground">
            Spent today · {formatLocalDate(today.startDate!)}
          </h2>
          <AnimatedMoney
            paise={spentToday}
            currency={profile.currency}
            className="tabular text-2xl font-semibold"
            data-testid="home-spent-today"
          />
          <p className="text-xs text-muted-foreground">Expenses minus refunds since midnight.</p>
        </Card>
        <Card className="gap-1">
          <h2 className="text-sm text-muted-foreground">Spent this month · {monthName}</h2>
          <AnimatedMoney
            paise={spentMonth}
            currency={profile.currency}
            className="tabular text-2xl font-semibold"
            data-testid="home-spent-month"
          />
          <p className="text-xs text-muted-foreground">
            {incomeMonth > 0 ? `Income received this month: ${money(incomeMonth)}. ` : ""}
            Not the same as what’s left of your allowance.
          </p>
        </Card>
      </section>

      <section aria-labelledby="quick-add-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 id="quick-add-heading" className="font-semibold">
            Quick add
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/add">
              Edit tiles
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <QuickAdd
          kit={kit}
          tiles={tileEntries(presets, kit.categories)}
          shortcuts={shortcutEntries(mergeLedger(ledger, latestExpense), kit.categories, now)}
          compact
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 gap-2 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent</h2>
            {recent.length > 0 && (
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transactions">
                  All transactions
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
          {recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Receipt className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Nothing recorded yet. Tap a tile above — your first entry shows up here.
              </p>
            </div>
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
        </Card>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
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
      </div>
    </>
  );
}
