import Link from "next/link";
import { ArrowRight, Gauge, PiggyBank, Target } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { BudgetRemaining } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  type BudgetEvaluation,
  type GoalProgress,
  type Paise,
  type SavingsGoal,
  formatBasisPoints,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";

type Money = (paise: Paise) => string;

const budgetTone = (evaluation: BudgetEvaluation) =>
  evaluation.status === "exceeded" || evaluation.status === "over_pace" ? "warning" : "money";

/** A brand-new user: one card with both first steps, not two empty cards. */
export function PlanFirstSteps() {
  return (
    <Surface data-testid="plan-first-steps">
      <StatePanel
        size="section"
        icon={Target}
        title="Plan when you’re ready"
        description="A monthly budget shows your pace; a goal keeps money set aside. Both are optional."
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/budgets">Set a monthly budget</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/goals">Add a savings goal</Link>
            </Button>
          </>
        }
      />
    </Surface>
  );
}

/** Home's monthly budget: the total budget, alerts, and the category budgets closest to their limit. */
export function BudgetSnapshot({
  alertCount,
  budgetEval,
  categoryEvals,
  hasBudgets,
  categoryName,
  money,
}: {
  alertCount: number;
  budgetEval: BudgetEvaluation | null;
  categoryEvals: BudgetEvaluation[];
  hasBudgets: boolean;
  categoryName: (id: string | null) => string;
  money: Money;
}) {
  return (
    <Surface data-testid="budget-snapshot">
      <SurfaceHeader
        title="Monthly budget"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/budgets">
              {hasBudgets ? "All budgets" : "Set one"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      {alertCount > 0 && (
        <Notice
          tone="warning"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/budgets">See budgets</Link>
            </Button>
          }
        >
          {alertCount} budget{alertCount === 1 ? " has" : "s have"} reached an alert level
        </Notice>
      )}
      {budgetEval ? (
        <div className="flex flex-col gap-1.5">
          <Progress
            bp={budgetEval.usedBp}
            tone={budgetTone(budgetEval)}
            label={
              <>
                <span className="font-medium money text-foreground">
                  {money(Math.max(0, budgetEval.spentPaise))}
                </span>{" "}
                of <span className="money">{money(budgetEval.limitPaise)}</span>
              </>
            }
            valueText={`${formatBasisPoints(budgetEval.usedBp, 0)} used`}
          />
          <BudgetRemaining remainingPaise={budgetEval.remainingPaise} money={money} />
        </div>
      ) : (
        !hasBudgets && (
          <p className="type-body text-muted-foreground">
            No monthly budget yet. A budget is a target, not reserved money.
          </p>
        )
      )}
      {categoryEvals.length > 0 && (
        <ul className="flex flex-col gap-3 border-t pt-3">
          {categoryEvals.map((evaluation) => (
            <li key={evaluation.budgetId} className="flex flex-col gap-1">
              <Progress
                bp={evaluation.usedBp}
                tone={budgetTone(evaluation)}
                label={categoryName(evaluation.categoryId)}
                valueText={`${formatBasisPoints(evaluation.usedBp, 0)} used`}
              />
              <BudgetRemaining
                remainingPaise={evaluation.remainingPaise}
                money={money}
                className="text-xs"
              />
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/** Home's savings goals: the first two active goals. Set-aside money is still in the balance. */
export function GoalSnapshot({
  goalCards,
  money,
}: {
  goalCards: { goal: SavingsGoal; progress: GoalProgress }[];
  money: Money;
}) {
  return (
    <Surface data-testid="goal-snapshot">
      <SurfaceHeader
        title="Savings goals"
        meta="Set aside, still part of your balance"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/goals">
              {goalCards.length > 0 ? "All goals" : "Add one"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        }
      />
      {goalCards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {goalCards.map(({ goal, progress }) => (
            <li key={goal.id}>
              <Link
                href={`/goals/${goal.id}`}
                className="-mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Progress
                  bp={progress.progressBp}
                  tone="money"
                  label={<span className="font-medium text-foreground">{goal.title}</span>}
                  valueText={`${money(progress.savedPaise)} of ${money(goal.targetPaise)}`}
                />
                <span className="type-caption money text-money-earmark">
                  <PiggyBank className="mr-1 inline size-3.5" aria-hidden="true" />
                  {money(progress.remainingPaise)} to go
                  {goal.targetDate ? ` · target ${formatLocalDate(goal.targetDate)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-body text-muted-foreground">
          No savings goal yet. Money you set aside for a goal isn’t counted as spending.
        </p>
      )}
    </Surface>
  );
}

/** A link, not a figure: Safe to Spend is an estimate, and Home doesn't read what it needs. */
export function SafeToSpendLink() {
  return (
    <Surface variant="interactive" asChild>
      <Link href="/safe-to-spend" data-testid="safe-to-spend-link">
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-feedback-info/15 text-money-estimate">
            <Gauge className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-body font-semibold">Safe to Spend</span>
            <span className="type-caption text-muted-foreground">
              An estimate of what’s flexible until your next income
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
      </Link>
    </Surface>
  );
}
