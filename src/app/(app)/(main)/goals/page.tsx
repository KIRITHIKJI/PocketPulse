import type { Metadata } from "next";
import Link from "next/link";
import { PiggyBank } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { GoalFormDialog } from "@/components/plan/goal-form";
import { PlanNote, ProgressRing } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

  const card = (goal: SavingsGoal) => {
    const progress = goalProgress(goal, ledger, today, cadence, money);
    const badge = STATUS_BADGE[goal.status];
    const done = goal.status === "completed";
    return (
      <li key={goal.id} className="min-w-0">
        <Link
          href={`/goals/${goal.id}`}
          className="block rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Card
            className="h-full flex-row items-center gap-4 transition-colors hover:bg-accent/50"
            data-testid="goal-card"
          >
            <ProgressRing bp={done ? 10_000 : progress.progressBp}>
              <CategoryBadge icon={goal.icon ?? "piggy-bank"} color={null} size="sm" />
            </ProgressRing>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-semibold">{goal.title}</h3>
                {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
              </div>
              <p className="tabular text-sm">
                {money(progress.savedPaise)} of {money(goal.targetPaise)} ·{" "}
                {formatBasisPoints(progress.progressBp, 0)}
              </p>
              <p className="text-xs text-muted-foreground">{progress.explanation}</p>
            </div>
          </Card>
        </Link>
      </li>
    );
  };

  const section = (title: string, list: SavingsGoal[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-3" aria-label={title}>
        <h2 className="font-semibold">{title}</h2>
        <ul className="grid gap-3 lg:grid-cols-2">{list.map(card)}</ul>
      </section>
    );

  return (
    <>
      <PageHeader
        title="Savings goals"
        description="Pockets inside your tracked money. Setting money aside isn’t spending, and it doesn’t change your balance."
        actions={<GoalFormDialog today={today} />}
      />
      <SectionTabs section="plan" />

      {goals.length === 0 ? (
        <StatePanel
          icon={PiggyBank}
          title="No savings goals yet"
          description="Add what you’re saving for, then set money aside for it. It comes off what’s safe to spend, but it’s still your money and never counts as spending."
        />
      ) : (
        <>
          <Card className="gap-1">
            <h2 className="text-sm text-muted-foreground">Set aside across all goals · now</h2>
            <p className="tabular text-3xl font-semibold tracking-tight" data-testid="total-saved">
              {money(setAside)}
            </p>
            <p className="text-xs text-muted-foreground">
              Still part of your tracked balance of {money(result.inputs.balancePaise)}. It’s only
              earmarked.
            </p>
          </Card>
          {section(
            "Active",
            goals.filter((g) => g.status === "active"),
          )}
          {section(
            "Paused",
            goals.filter((g) => g.status === "paused"),
          )}
          {section(
            "Complete",
            goals.filter((g) => g.status === "completed"),
          )}
          {section(
            "Archived",
            goals.filter((g) => g.status === "archived"),
          )}
          <PlanNote>
            Money in paused, complete or archived goals stays set aside until you release it.
          </PlanNote>
        </>
      )}
    </>
  );
}
