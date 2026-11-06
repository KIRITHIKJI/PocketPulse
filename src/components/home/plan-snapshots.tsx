import Link from "next/link";
import { ArrowRight, Bell, PiggyBank, Target } from "lucide-react";

import { BudgetRemaining, Meter } from "@/components/plan/parts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type BudgetEvaluation,
  type GoalProgress,
  type Paise,
  type SavingsGoal,
  formatBasisPoints,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";

type Money = (paise: Paise) => string;

/** Home's monthly budget card: the total budget, alerts, and the category budgets closest to their limit. */
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
    <Card className="gap-3" data-testid="budget-snapshot">
      <div className="flex items-center gap-2">
        <Target className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">Monthly budget</h2>
      </div>
      {alertCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 p-2 text-xs">
          <Bell className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
          <Link
            href="/budgets"
            className="inline-flex min-h-8 items-center underline-offset-4 hover:underline"
          >
            {alertCount} budget{alertCount === 1 ? " has" : "s have"} reached an alert level
          </Link>
        </p>
      )}
      {budgetEval ? (
        <>
          <p className="tabular text-sm">
            <span className="font-semibold">{money(Math.max(0, budgetEval.spentPaise))}</span> of{" "}
            {money(budgetEval.limitPaise)} · {formatBasisPoints(budgetEval.usedBp, 0)} used
          </p>
          <Meter
            bp={budgetEval.usedBp}
            tone={
              budgetEval.status === "exceeded" || budgetEval.status === "over_pace"
                ? "warning"
                : "primary"
            }
          />
          <BudgetRemaining remainingPaise={budgetEval.remainingPaise} money={money} />
        </>
      ) : (
        !hasBudgets && (
          <>
            <p className="text-sm text-muted-foreground">
              No monthly budget yet. A budget is a target, not reserved money.
            </p>
            <Button variant="outline" size="sm" asChild className="self-start">
              <Link href="/budgets">Set a monthly budget</Link>
            </Button>
          </>
        )
      )}
      {categoryEvals.length > 0 && (
        <ul className="flex flex-col gap-2 border-t pt-2">
          {categoryEvals.map((evaluation) => (
            <li key={evaluation.budgetId} className="flex flex-col gap-1">
              <p className="flex justify-between gap-2 text-sm">
                <span className="truncate">{categoryName(evaluation.categoryId)}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {formatBasisPoints(evaluation.usedBp, 0)} used
                </span>
              </p>
              <BudgetRemaining
                remainingPaise={evaluation.remainingPaise}
                money={money}
                className="text-xs"
              />
            </li>
          ))}
        </ul>
      )}
      {hasBudgets && (
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link href="/budgets">
            All budgets
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </Card>
  );
}

/** Home's savings goals card: the first two active goals and their progress. */
export function GoalSnapshot({
  goalCards,
  money,
}: {
  goalCards: { goal: SavingsGoal; progress: GoalProgress }[];
  money: Money;
}) {
  return (
    <Card className="gap-3" data-testid="goal-snapshot">
      <div className="flex items-center gap-2">
        <PiggyBank className="size-4 text-positive" aria-hidden="true" />
        <h2 className="font-semibold">Savings goals</h2>
      </div>
      {goalCards.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {goalCards.map(({ goal, progress }) => (
            <li key={goal.id}>
              <Link href={`/goals/${goal.id}`} className="flex flex-col gap-1.5">
                <span className="flex justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{goal.title}</span>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {money(progress.savedPaise)} of {money(goal.targetPaise)}
                  </span>
                </span>
                <Meter bp={progress.progressBp} tone="positive" />
                <span className="text-xs text-muted-foreground">
                  {money(progress.remainingPaise)} to go
                  {goal.targetDate ? ` · target ${formatLocalDate(goal.targetDate)}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            No savings goal yet. Money you set aside for a goal isn’t counted as spending.
          </p>
          <Button variant="outline" size="sm" asChild className="self-start">
            <Link href="/goals">Add a savings goal</Link>
          </Button>
        </>
      )}
    </Card>
  );
}
