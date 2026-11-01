import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { IncomeDatePrompt } from "@/components/plan/income-date-prompt";
import { FigureRow, PlanNote } from "@/components/plan/parts";
import { PlanningForm } from "@/components/plan/planning-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";
import { dueItems } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Safe to spend" };

export default async function SafeToSpendPage() {
  const { profile, commitments, templates, ledger, today, money, result } = await loadPlan();
  const { inputs } = result;
  const ok = result.status === "ok";
  const horizon = inputs.horizonEndDate ? formatLocalDate(inputs.horizonEndDate) : null;
  const counted = dueItems({
    commitments,
    templates,
    ledger,
    today,
    until: inputs.horizonEndDate ?? today,
    countedIds: inputs.commitmentIds,
  }).filter((item) => item.counted);

  return (
    <>
      <PageHeader
        title="Safe to spend"
        description="What’s flexible after savings and bills, up to your next income. An estimate from what you’ve recorded, not a guarantee."
      />
      <SectionTabs section="plan" />

      {!ok && (
        <IncomeDatePrompt
          nextIncomeDate={profile.nextIncomeDate}
          frequency={profile.incomeFrequency}
          today={today}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-2">
          <h2 className="text-sm text-muted-foreground">Flexible money · now</h2>
          <p
            className="tabular text-4xl font-semibold tracking-tight"
            data-testid="flexible"
            data-paise={result.flexiblePaise}
          >
            {money(result.flexiblePaise)}
          </p>
          <dl className="divide-y">
            <FigureRow
              label="Tracked balance · all wallets"
              value={money(inputs.balancePaise)}
              testId="stp-balance"
              explanation="Opening balances plus what you’ve recorded. Not a bank balance."
            />
            <FigureRow
              label="Set aside for goals"
              value={`−${money(inputs.earmarkedPaise)}`}
              testId="stp-earmarked"
              explanation="Still your money, but it’s spoken for. Release it from the goal to free it up."
            />
            <FigureRow
              label={horizon ? `Unpaid bills due by ${horizon}` : "Unpaid bills"}
              value={`−${money(inputs.commitmentsDuePaise)}`}
              testId="stp-commitments"
              explanation={`${counted.length} item${counted.length === 1 ? "" : "s"} not paid yet. Paid bills are already in your balance and aren’t subtracted again.`}
            />
            {inputs.reservePaise > 0 && (
              <FigureRow
                label="Minimum reserve"
                value={`−${money(inputs.reservePaise)}`}
                explanation="The amount you chose to keep untouched."
              />
            )}
            <FigureRow
              label="Flexible money"
              value={money(result.flexiblePaise)}
              strong
              explanation="Balance minus everything above."
            />
          </dl>
        </Card>

        <Card className="min-w-0 gap-2">
          <h2 className="font-semibold">Until your next income</h2>
          <dl className="divide-y">
            <FigureRow
              label="Days until next income"
              value={result.daysUntilNextIncome === null ? "—" : String(result.daysUntilNextIncome)}
              testId="stp-days"
              explanation={
                inputs.nextIncomeDate && ok
                  ? `Income expected ${formatLocalDate(inputs.nextIncomeDate)}. Today counts; that day doesn’t.`
                  : "Needs your next income date."
              }
            />
            <FigureRow
              label="Suggested daily limit"
              value={result.suggestedDailyPaise === null ? "—" : money(result.suggestedDailyPaise)}
              testId="stp-daily"
              explanation={
                ok
                  ? "Flexible money divided by those days, rounded down."
                  : "Not shown without a date. It would be a guess."
              }
            />
            <FigureRow
              label="Suggested weekly limit"
              value={
                result.suggestedWeeklyPaise === null ? "—" : money(result.suggestedWeeklyPaise)
              }
              testId="stp-weekly"
              explanation={ok ? "Up to seven days of the daily limit." : undefined}
            />
            <FigureRow
              label="Expected balance before next income"
              value={
                result.expectedEndBalancePaise === null
                  ? "—"
                  : money(result.expectedEndBalancePaise)
              }
              testId="stp-end-balance"
              explanation={result.endBalanceAssumption ?? undefined}
            />
          </dl>
          {result.warnings.length > 0 && (
            <ul className="flex flex-col gap-2" data-testid="stp-warnings">
              {result.warnings.map((warning) => (
                <li key={warning} className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-sm">
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  {warning}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {counted.length > 0 && (
        <Card className="gap-2">
          <h2 className="font-semibold">Bills being subtracted</h2>
          <ul className="divide-y" data-testid="stp-bills">
            {counted.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.label === "Bill" ? "Planned, not paid" : item.label} · due{" "}
                    {formatLocalDate(item.dueDate)}
                  </span>
                </span>
                <span className="tabular shrink-0">{money(item.amountPaise)}</span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" asChild className="self-start">
            <Link href="/recurring">
              Pay or change these
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </Card>
      )}

      <Card className="gap-3">
        <h2 className="font-semibold">Your planning details</h2>
        <PlanningForm
          nextIncomeDate={profile.nextIncomeDate}
          reservePaise={profile.safeToSpendReservePaise}
          today={today}
        />
      </Card>

      <PlanNote>
        How often money comes in is set in{" "}
        <Link href="/settings#settings-income" className="underline underline-offset-4">
          Settings
        </Link>
        . Budgets aren’t subtracted here: they’re targets, not reserved money.
      </PlanNote>
    </>
  );
}
