import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Compass,
  Hourglass,
  LifeBuoy,
  PiggyBank,
  Target,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { IncomeDatePrompt } from "@/components/plan/income-date-prompt";
import { FigureRow, PlanNote } from "@/components/plan/parts";
import { PlanningForm } from "@/components/plan/planning-form";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { type SurvivalStatus, survivalPlan } from "@/domain";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Survival mode" };

const STATUS_LOOK: Record<SurvivalStatus, { icon: typeof Compass; tone: string; label: string }> = {
  needs_date: { icon: Hourglass, tone: "bg-muted text-muted-foreground", label: "Needs a date" },
  too_early: { icon: Compass, tone: "bg-primary-soft text-primary", label: "Just getting started" },
  on_track: {
    icon: CircleCheck,
    tone: "bg-feedback-success/10 text-feedback-success",
    label: "On track",
  },
  watch: {
    icon: Compass,
    tone: "bg-feedback-info/10 text-feedback-info",
    label: "Keep an eye on it",
  },
  at_risk: {
    icon: LifeBuoy,
    tone: "bg-feedback-warning/10 text-feedback-warning",
    label: "At risk",
  },
};

/** Things that actually change the plan, each opening the screen where it's done. */
const TIPS = [
  {
    href: "/goals",
    icon: PiggyBank,
    title: "Pause a goal or release some savings",
    detail: "Money set aside comes off your daily amount; releasing it frees it up.",
  },
  {
    href: "/recurring",
    icon: CalendarClock,
    title: "Skip or move a bill",
    detail: "Unpaid bills before your next income are subtracted from the plan.",
  },
  {
    href: "/budgets",
    icon: Target,
    title: "Check your budgets",
    detail: "See which categories are running ahead of pace this month.",
  },
] as const;

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
        description="A calm look at making your money last until your next allowance."
      />
      <SectionTabs section="plan" />

      {plan.status === "needs_date" ? (
        <Surface variant="hero">
          <IncomeDatePrompt
            size="section"
            nextIncomeDate={profile.nextIncomeDate}
            frequency={profile.incomeFrequency}
            today={today}
            form={
              <PlanningForm
                nextIncomeDate={profile.nextIncomeDate}
                reservePaise={profile.safeToSpendReservePaise}
                today={today}
                dateOnly
              />
            }
          />
        </Surface>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
            <Surface variant="hero" className="min-w-0 lg:col-span-3" data-testid="survival-status">
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-xl",
                    look.tone,
                  )}
                  aria-hidden="true"
                >
                  <Icon className="size-6" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="type-caption font-medium text-text-secondary">{look.label}</p>
                  <h2 className="type-heading text-balance">{plan.headline}</h2>
                  <p className="type-body text-muted-foreground">{plan.detail}</p>
                </div>
              </div>
              {cycle ? (
                <div className="flex flex-col gap-1.5">
                  <Progress
                    steps={cycle.lengthDays}
                    value={cycle.dayNumber}
                    tone="neutral"
                    label={`This allowance period · started ${formatLocalDate(cycle.startDate)}`}
                    valueText={`Day ${cycle.dayNumber} of ${cycle.lengthDays}`}
                  />
                  <p className="type-caption text-muted-foreground" data-testid="survival-cycle">
                    Spent so far this period:{" "}
                    <span className="money">{money(cycle.spentPaise)}</span>
                    {cycle.expectedIncomePaise ? (
                      <>
                        , of a usual{" "}
                        <span className="money">{money(cycle.expectedIncomePaise)}</span> allowance.
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                </div>
              ) : (
                <p className="type-caption text-muted-foreground">
                  There’s no regular period to show, because your income isn’t set as weekly,
                  fortnightly or monthly.{" "}
                  <Link href="/settings#settings-income" className="underline underline-offset-4">
                    Change it in Settings
                  </Link>
                  .
                </p>
              )}
            </Surface>

            <Surface className="min-w-0 lg:col-span-2">
              <div className="flex flex-col gap-0.5">
                <h2 className="type-body text-text-secondary">Daily allowance · estimate</h2>
                <p className="type-display text-money-estimate money" data-testid="survival-daily">
                  {money(plan.dailyAllowancePaise!)}
                </p>
                <p className="type-caption text-muted-foreground">
                  Your flexible money divided by the days left.
                </p>
              </div>
              <dl className="divide-y">
                <FigureRow label="Spent today" value={money(plan.spentTodayPaise)} />
                <FigureRow
                  label="Days left"
                  value={String(plan.daysLeft)}
                  testId="survival-days"
                  explanation={`Income expected ${formatLocalDate(result.inputs.nextIncomeDate!)}.`}
                />
                <FigureRow
                  label="Weekly allowance"
                  value={money(plan.weeklyAllowancePaise!)}
                  explanation="Up to seven days of the daily amount."
                />
              </dl>
              <Button variant="ghost" size="sm" asChild className="mt-auto -ml-2 self-start">
                <Link href="/safe-to-spend">
                  See how this is worked out
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </Surface>
          </div>

          <Surface>
            <SurfaceHeader title="Ways to make room" meta="Each one changes the plan above." />
            <ul className="-mx-2 flex flex-col divide-y">
              {TIPS.map((tip) => (
                <li key={tip.href}>
                  <Link
                    href={tip.href}
                    className="flex min-h-14 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-(--duration-quick) outline-none hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <tip.icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block type-body font-medium">{tip.title}</span>
                      <span className="block type-caption text-muted-foreground">{tip.detail}</span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Surface>
        </>
      )}

      <PlanNote>
        These are estimates from what you’ve recorded. A bigger day doesn’t undo anything: the plan
        simply spreads what’s left.
      </PlanNote>
    </>
  );
}
