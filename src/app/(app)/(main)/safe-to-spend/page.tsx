import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { IncomeDatePrompt } from "@/components/plan/income-date-prompt";
import { FigureRow, PlanNote } from "@/components/plan/parts";
import { PlanningForm, PlanningFormState } from "@/components/plan/planning-form";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";
import { dueItems } from "@/lib/plan-view";
import { cn } from "@/lib/utils";

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

  const form = (
    <PlanningForm
      nextIncomeDate={profile.nextIncomeDate}
      reservePaise={profile.safeToSpendReservePaise}
      today={today}
    />
  );

  // What the daily figure leads to. Without a date each one is "—", and says why.
  const limits = (
    <dl className="divide-y">
      {!ok && (
        <FigureRow
          label="Suggested daily limit"
          value="—"
          testId="stp-daily"
          explanation="Not shown without a date. It would be a guess."
        />
      )}
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
        label="Suggested weekly limit"
        value={result.suggestedWeeklyPaise === null ? "—" : money(result.suggestedWeeklyPaise)}
        testId="stp-weekly"
        explanation={ok ? "Up to seven days of the daily limit." : undefined}
      />
      <FigureRow
        label="Expected balance before next income"
        value={
          result.expectedEndBalancePaise === null ? "—" : money(result.expectedEndBalancePaise)
        }
        testId="stp-end-balance"
        explanation={result.endBalanceAssumption ?? undefined}
      />
    </dl>
  );

  // The form moves between the empty panel and its own card; its result stays above both.
  return (
    <PlanningFormState>
      <PageHeader
        title="Safe to spend"
        description="What’s flexible after savings and bills, until your next income."
      />
      <SectionTabs section="plan" />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Surface variant="hero" className="min-w-0">
          {ok ? (
            <>
              <p className="type-caption text-text-secondary">Safe to spend · estimate</p>
              <p className="type-body text-text-secondary">
                About{" "}
                <span
                  className="block type-display text-money-estimate money"
                  data-testid="stp-daily"
                >
                  {result.suggestedDailyPaise === null ? "—" : money(result.suggestedDailyPaise)}
                </span>{" "}
                a day until {formatLocalDate(inputs.nextIncomeDate!)}, an estimate from what you’ve
                recorded.
              </p>
            </>
          ) : (
            <IncomeDatePrompt
              size="section"
              nextIncomeDate={profile.nextIncomeDate}
              frequency={profile.incomeFrequency}
              today={today}
              form={form}
            />
          )}
          {limits}
          {result.warnings.length > 0 && (
            <ul className="flex flex-col gap-2" data-testid="stp-warnings">
              {result.warnings.map((warning) => (
                <li key={warning}>
                  <Notice tone="warning">{warning}</Notice>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <Surface className="min-w-0">
          <details open className="group flex flex-col">
            <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
              <h2 className="flex items-center gap-2 type-heading">
                <ChevronDown
                  className="size-4 self-center text-muted-foreground transition-transform duration-(--duration-quick) group-open:rotate-180"
                  aria-hidden="true"
                />
                Flexible money · now
              </h2>
              <span
                className={cn(
                  "type-heading money",
                  result.flexiblePaise < 0 && "text-money-negative",
                )}
                data-testid="flexible"
                data-paise={result.flexiblePaise}
              >
                {money(result.flexiblePaise)}
              </span>
            </summary>
            <dl className="mt-2 divide-y">
              <FigureRow
                label="Tracked balance · all wallets"
                value={money(inputs.balancePaise)}
                testId="stp-balance"
                explanation="Opening balances plus what you’ve recorded. Not a bank balance."
              />
              <FigureRow
                label="Less set aside for goals"
                value={money(inputs.earmarkedPaise)}
                testId="stp-earmarked"
                valueClassName="text-money-earmark"
                explanation="Still yours, but spoken for. Release it from the goal to free it up."
              />
              <FigureRow
                label={horizon ? `Less unpaid bills due by ${horizon}` : "Less unpaid bills"}
                value={money(inputs.commitmentsDuePaise)}
                testId="stp-commitments"
                explanation={`${counted.length} item${counted.length === 1 ? "" : "s"} not paid yet. Paid bills are already in your balance and aren’t subtracted again.`}
              />
              {inputs.reservePaise > 0 && (
                <FigureRow
                  label="Less minimum reserve"
                  value={money(inputs.reservePaise)}
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
            {counted.length > 0 && (
              <Surface variant="inset" className="mt-2 gap-1">
                <h3 className="type-body font-medium">Bills being subtracted</h3>
                <ul className="divide-y" data-testid="stp-bills">
                  {counted.map((item) => (
                    <li
                      key={item.key}
                      className="flex min-h-14 items-center justify-between gap-3 py-2 lg:min-h-12"
                    >
                      <span className="min-w-0">
                        <span className="block truncate type-body font-medium">{item.title}</span>
                        <span className="type-caption text-muted-foreground">
                          {item.label === "Bill" ? "Planned, not paid" : item.label} · due{" "}
                          {formatLocalDate(item.dueDate)}
                        </span>
                      </span>
                      <span className="shrink-0 type-body money">{money(item.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
                <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
                  <Link href="/recurring">
                    Pay or change these
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </Surface>
            )}
          </details>
        </Surface>
      </div>

      {ok && (
        <Surface>
          <SurfaceHeader title="Your planning details" />
          {form}
        </Surface>
      )}

      <PlanNote>
        How often money comes in is set in{" "}
        <Link href="/settings#settings-income" className="underline underline-offset-4">
          Settings
        </Link>
        . Budgets aren’t subtracted here: they’re targets, not reserved money.
      </PlanNote>
    </PlanningFormState>
  );
}
