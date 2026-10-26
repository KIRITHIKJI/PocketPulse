import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, ListChecks, PiggyBank, Receipt, Target } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AnimatedMoney } from "@/components/transactions/animated-money";
import { EntryCard } from "@/components/transactions/entry-list";
import { QuickAdd } from "@/components/transactions/quick-add";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type Budget,
  consolidatedBalanceAt,
  evaluateBudget,
  formatBasisPoints,
  formatMoney,
  goalProgress,
  indexById,
  netSpending,
  occurredAtMs,
  resolvePeriod,
  sumPaise,
  toLocalDate,
  transactionsInPeriod,
} from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import {
  getAccounts,
  getActiveGoals,
  getLedger,
  getMonthlyBudgets,
  getProfile,
  getQuickAddPresets,
} from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
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

function Progress({ bp, tone }: { bp: number; tone: "primary" | "positive" | "warning" }) {
  const width = `${Math.min(100, Math.max(0, bp / 100))}%`;
  const color = { primary: "bg-primary", positive: "bg-positive", warning: "bg-warning" }[tone];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={`h-full rounded-full ${color} transition-[width] duration-500`}
        style={{ width }}
      />
    </div>
  );
}

export default async function HomePage() {
  const session = await requireSession();
  const kit = await loadEntryKit();
  const [profile, accounts, ledger, presets, budgets, goals] = await Promise.all([
    getProfile(),
    getAccounts(),
    getLedger(),
    getQuickAddPresets(),
    getMonthlyBudgets(),
    getActiveGoals(),
  ]);
  const tz = profile.timeZone;
  const now = requestNow();
  const settings = { timeZone: tz, weekStartsOn: profile.weekStartsOn };
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });

  // Every figure below comes from the ledger through the domain layer; nothing is stored.
  const balance = consolidatedBalanceAt(accounts, ledger, now, tz);
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

  const ctx = {
    categoriesById: new Map(kit.categories.map((c) => [c.id, c])),
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    currency: profile.currency,
  };
  const recent = [...ledger].sort(newestFirst).slice(0, 5);

  const totalBudget = budgets.find((b) => b.categoryId === null);
  const budgetEval = totalBudget
    ? evaluateBudget(
        {
          id: totalBudget.id,
          ownerId: session.userId,
          categoryId: null,
          limitPaise: totalBudget.limitPaise,
          period: "monthly",
          customFrom: null,
          customTo: null,
          alertThresholdsBp: [5_000, 8_000, 10_000],
        } satisfies Budget,
        ledger,
        now,
        settings,
      )
    : null;
  const goalCards = goals.slice(0, 2).map((g) => ({
    goal: g,
    progress: goalProgress(
      {
        id: g.id,
        ownerId: session.userId,
        title: g.title,
        targetPaise: g.targetPaise,
        targetDate: g.targetDate,
        status: "active",
      },
      ledger,
      kit.today,
    ),
  }));

  return (
    <>
      <PageHeader
        title="Home"
        description="Your tracked balance, today’s spending, budgets and goals at a glance."
      />

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
          shortcuts={shortcutEntries(ledger, kit.categories, now)}
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
          <Card className="gap-3" data-testid="budget-snapshot">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-primary" aria-hidden="true" />
              <h2 className="font-semibold">Monthly budget</h2>
            </div>
            {budgetEval ? (
              <>
                <p className="tabular text-sm">
                  <span className="font-semibold">{money(Math.max(0, budgetEval.spentPaise))}</span>{" "}
                  of {money(budgetEval.limitPaise)} · {formatBasisPoints(budgetEval.usedBp, 0)} used
                </p>
                <Progress
                  bp={budgetEval.usedBp}
                  tone={
                    budgetEval.status === "exceeded" || budgetEval.status === "over_pace"
                      ? "warning"
                      : "primary"
                  }
                />
                <p className="text-xs text-muted-foreground">{budgetEval.explanation}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No monthly budget yet. A budget is a spending target, not money set aside.
                </p>
                <Button variant="outline" size="sm" asChild className="self-start">
                  <Link href="/onboarding?step=budgets">Set a monthly budget</Link>
                </Button>
              </>
            )}
          </Card>

          <Card className="gap-3" data-testid="goal-snapshot">
            <div className="flex items-center gap-2">
              <PiggyBank className="size-4 text-positive" aria-hidden="true" />
              <h2 className="font-semibold">Savings goals</h2>
            </div>
            {goalCards.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {goalCards.map(({ goal, progress }) => (
                  <li key={goal.id} className="flex flex-col gap-1.5">
                    <p className="flex justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{goal.title}</span>
                      <span className="tabular shrink-0 text-muted-foreground">
                        {money(progress.savedPaise)} of {money(goal.targetPaise)}
                      </span>
                    </p>
                    <Progress bp={progress.progressBp} tone="positive" />
                    {goal.targetDate && (
                      <p className="text-xs text-muted-foreground">
                        Target date {formatLocalDate(goal.targetDate)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No savings goal yet. Money you set aside for a goal isn’t counted as spending.
                </p>
                <Button variant="outline" size="sm" asChild className="self-start">
                  <Link href="/onboarding?step=goal">Add a savings goal</Link>
                </Button>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
