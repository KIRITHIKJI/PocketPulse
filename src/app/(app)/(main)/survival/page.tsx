import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleCheck, Compass, Hourglass, LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { IncomeDatePrompt } from "@/components/plan/income-date-prompt";
import { FigureRow, Meter, PlanNote } from "@/components/plan/parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type SurvivalStatus, survivalPlan } from "@/domain";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";

export const metadata: Metadata = { title: "Survival mode" };

const STATUS_LOOK: Record<SurvivalStatus, { icon: typeof Compass; tone: string; label: string }> = {
  needs_date: { icon: Hourglass, tone: "bg-muted text-muted-foreground", label: "Needs a date" },
  too_early: { icon: Compass, tone: "bg-primary-soft text-primary", label: "Just getting started" },
  on_track: { icon: CircleCheck, tone: "bg-positive-soft text-positive", label: "On track" },
  watch: { icon: Compass, tone: "bg-primary-soft text-primary", label: "Keep an eye on it" },
  at_risk: { icon: LifeBuoy, tone: "bg-warning/15 text-warning", label: "At risk" },
};

export default async function SurvivalPage() {
  const { profile, ledger, now, settings, today, money, result } = await loadPlan();
  const plan = survivalPlan({
    result,
    frequency: profile.incomeFrequency,
    expectedIncomePaise: profile.expectedIncomePaise,
    ledger,
    now,
    settings,
    money,
  });
  const look = STATUS_LOOK[plan.status];
  const Icon = look.icon;
  const { cycle } = plan;

  return (
    <>
      <PageHeader
        title="Survival mode"
        description="A calm look at making your money last until the next allowance. Same numbers as Safe to spend."
      />
      <SectionTabs section="plan" />

      {plan.status === "needs_date" ? (
        <IncomeDatePrompt
          nextIncomeDate={profile.nextIncomeDate}
          frequency={profile.incomeFrequency}
          today={today}
        />
      ) : (
        <>
          <Card className="flex-row items-start gap-4" data-testid="survival-status">
            <span
              className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${look.tone}`}
              aria-hidden="true"
            >
              <Icon className="size-6" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {look.label}
              </p>
              <h2 className="text-lg font-semibold text-balance">{plan.headline}</h2>
              <p className="text-sm text-muted-foreground">{plan.detail}</p>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="min-w-0 gap-2">
              <h2 className="font-semibold">Your allowance plan</h2>
              <dl className="divide-y">
                <FigureRow
                  label="Days left"
                  value={String(plan.daysLeft)}
                  testId="survival-days"
                  explanation={`Income expected ${formatLocalDate(result.inputs.nextIncomeDate!)}.`}
                />
                <FigureRow
                  label="Daily allowance"
                  value={money(plan.dailyAllowancePaise!)}
                  testId="survival-daily"
                  explanation="Your flexible money divided by the days left."
                />
                <FigureRow
                  label="Weekly allowance"
                  value={money(plan.weeklyAllowancePaise!)}
                  explanation="Up to seven days of that."
                />
                <FigureRow label="Spent today" value={money(plan.spentTodayPaise)} />
              </dl>
            </Card>

            <Card className="min-w-0 gap-3">
              <h2 className="font-semibold">This allowance period</h2>
              {cycle ? (
                <>
                  <p className="tabular text-sm">
                    Day {cycle.dayNumber} of {cycle.lengthDays} · started{" "}
                    {formatLocalDate(cycle.startDate)}
                  </p>
                  <Meter
                    bp={Math.round((cycle.dayNumber / cycle.lengthDays) * 10_000)}
                    tone="primary"
                  />
                  <p className="text-sm text-muted-foreground" data-testid="survival-cycle">
                    Spent so far this period: {money(cycle.spentPaise)}
                    {cycle.expectedIncomePaise
                      ? `, of a usual ${money(cycle.expectedIncomePaise)} allowance.`
                      : "."}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  There’s no regular period to show, because your income isn’t set as weekly,
                  fortnightly or monthly.{" "}
                  <Link href="/settings#settings-income" className="underline underline-offset-4">
                    Change it in Settings
                  </Link>
                  .
                </p>
              )}
              <Button variant="ghost" size="sm" asChild className="mt-auto self-start">
                <Link href="/safe-to-spend">
                  See how this is worked out
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Card>
          </div>
        </>
      )}

      <PlanNote>
        These are estimates from what you’ve recorded. A bigger day doesn’t undo anything: the plan
        simply spreads what’s left.
      </PlanNote>
    </>
  );
}
