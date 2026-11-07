import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { GoalFormDialog } from "@/components/plan/goal-form";
import { PlanNote } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import {
  type ContributionCadence,
  type SavingsGoal,
  formatBasisPoints,
  goalProgress,
  totalEarmarked,
} from "@/domain";
import { loadPlan } from "@/lib/data/plan";
import { getGoals } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Savings goals" };

const STATUS_BADGE = {
  active: null,
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Complete", variant: "positive" },
  archived: { label: "Archived", variant: "outline" },
} as const;

export default async function GoalsPage() {
  const [plan, goals] = await Promise.all([loadPlan(), getGoals()]);
  const { profile, ledger, today, money, result } = plan;
  const cadence: ContributionCadence = ["weekly", "biweekly"].includes(profile.incomeFrequency)
    ? "weekly"
    : "monthly";
  const setAside = totalEarmarked(ledger);

  /** One goal: what it's for, how far along it is, and the money set aside (never spending). */
  const card = (goal: SavingsGoal) => {
    const progress = goalProgress(goal, ledger, today, cadence, money);
    const badge = STATUS_BADGE[goal.status];
    const done = goal.status === "completed";
    const bp = done ? 10_000 : progress.progressBp;
    return (
      <li key={goal.id} className="min-w-0">
        <Surface variant="interactive" className="h-full" asChild data-testid="goal-card">
          <Link href={`/goals/${goal.id}`}>
            <div className="flex items-start gap-3">
              <CategoryBadge icon={goal.icon ?? "piggy-bank"} color={null} size="sm" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="min-w-0 truncate type-heading">{goal.title}</h3>
                {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              </div>
            </div>
            <p className="type-body text-text-secondary">
              <span className="font-medium text-money-earmark money">
                {money(progress.savedPaise)}
              </span>{" "}
              set aside, still yours
            </p>
            <Progress
              bp={bp}
              aria-label={`${goal.title}: saved of target`}
              valueText={formatBasisPoints(bp, 0)}
            />
            <p className="type-caption text-muted-foreground">
              <span className="money">{money(progress.savedPaise)}</span> of{" "}
              <span className="money">{money(goal.targetPaise)}</span> ·{" "}
              <span className="money">{formatBasisPoints(progress.progressBp, 0)}</span>.{" "}
              {progress.explanation}
            </p>
          </Link>
        </Surface>
      </li>
    );
  };

  /** A goal that isn't being saved towards: one compact row, so it doesn't crowd active ones. */
  const row = (goal: SavingsGoal) => {
    const progress = goalProgress(goal, ledger, today, cadence, money);
    const badge = STATUS_BADGE[goal.status];
    return (
      <li key={goal.id}>
        <Link
          href={`/goals/${goal.id}`}
          data-testid="goal-card"
          className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-(--duration-quick) outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <CategoryBadge icon={goal.icon ?? "piggy-bank"} color={null} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate type-body font-medium">{goal.title}</span>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </span>
            <span className="type-caption text-muted-foreground">
              <span className="money">{money(goal.targetPaise)}</span> target
            </span>
          </span>
          <span className="shrink-0 type-body text-money-earmark money">
            {money(progress.savedPaise)}
            <span className="sr-only"> set aside</span>
          </span>
        </Link>
      </li>
    );
  };

  const rows = (title: string, list: SavingsGoal[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-stack" aria-label={title}>
        <h2 className="type-heading">
          {title}{" "}
          <span className="type-body font-normal text-muted-foreground">· {list.length}</span>
        </h2>
        <Surface className="p-1">
          <ul className="flex flex-col divide-y">{list.map(row)}</ul>
        </Surface>
      </section>
    );

  const grid = (list: SavingsGoal[]) => (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{list.map(card)}</ul>
  );

  const section = (title: string, list: SavingsGoal[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-stack" aria-label={title}>
        <h2 className="type-heading">{title}</h2>
        {grid(list)}
      </section>
    );

  const active = goals.filter((g) => g.status === "active");
  const paused = goals.filter((g) => g.status === "paused");
  const completed = goals.filter((g) => g.status === "completed");
  const archived = goals.filter((g) => g.status === "archived");
  const resting = paused.length + completed.length;

  return (
    <>
      <PageHeader
        title="Savings goals"
        description="Pockets inside your tracked money: setting money aside isn’t spending."
        actions={goals.length > 0 ? <GoalFormDialog today={today} /> : undefined}
      />
      <SectionTabs section="plan" />

      {goals.length === 0 ? (
        <StatePanel
          icon={PiggyBank}
          title="Save toward something specific"
          description="Money you set aside stays in your balance. It comes off what’s safe to spend, and it never counts as spending."
          actions={<GoalFormDialog today={today} />}
        />
      ) : (
        <>
          <Surface className="flex-row flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="type-body text-text-secondary">Set aside across all goals · now</h2>
            <p className="type-heading text-money-earmark money" data-testid="total-saved">
              {money(setAside)}
            </p>
            <p className="basis-full type-caption text-muted-foreground">
              Still yours, and still part of your tracked balance of{" "}
              <span className="money">{money(result.inputs.balancePaise)}</span>. It’s only
              earmarked.
            </p>
          </Surface>

          {active.length > 0 ? (
            section("Active", active)
          ) : (
            <Surface>
              <StatePanel
                size="section"
                icon={PiggyBank}
                title="No active goals"
                description="Add a goal, or resume one below, to keep setting money aside."
                actions={<GoalFormDialog today={today} />}
              />
            </Surface>
          )}

          {resting > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {rows("Paused", paused)}
              {rows("Complete", completed)}
            </div>
          )}

          {rows("Archived", archived)}

          <PlanNote>
            Money in paused, complete or archived goals stays set aside until you release it.
          </PlanNote>
        </>
      )}
    </>
  );
}
