import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, PartyPopper } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import {
  GoalMoveDialog,
  GoalPurchaseDialog,
  GoalStatusActions,
} from "@/components/plan/goal-actions";
import { GoalFormDialog } from "@/components/plan/goal-form";
import { GoalReleaseNotes } from "@/components/plan/goal-release-notes";
import { FigureRow, PlanNote, ProgressRing } from "@/components/plan/parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ContributionCadence,
  formatBasisPoints,
  goalForecast,
  goalMoves,
  goalProgress,
} from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { loadPlan } from "@/lib/data/plan";
import { getGoal, getGoalLedgerVersions, getGoals, getSpendingLedger } from "@/lib/data/queries";
import { mergeLedger } from "@/lib/data/slices";
import { formatDateTime, formatLocalDate } from "@/lib/format";
import { goalReleaseNotes } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Savings goal" };

/** Written by `record_goal_purchase`; it already says what happened. */
const PURCHASE_RELEASE_NOTE = "Released for a purchase";

const CADENCE_WORD = { weekly: "week", monthly: "month" } as const;

export default async function GoalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Purchases too: a release is only left behind when its purchase is gone from them.
  const [goal, plan, kit, goals, spending, versions] = await Promise.all([
    getGoal(id),
    loadPlan(),
    loadEntryKit(),
    getGoals(),
    getSpendingLedger(),
    getGoalLedgerVersions(),
  ]);
  if (!goal) notFound();
  const { profile, ledger, today, now, money, result } = plan;
  const cadence: ContributionCadence = ["weekly", "biweekly"].includes(profile.incomeFrequency)
    ? "weekly"
    : "monthly";
  const progress = goalProgress(goal, ledger, today, cadence, money);
  const forecast = goalForecast(goal, ledger, now, profile.timeZone);
  const moves = goalMoves(goal.id, ledger);
  const live = goal.status === "active" || goal.status === "paused";
  const done = goal.status === "completed";

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/goals">
            <ArrowLeft aria-hidden="true" />
            Savings goals
          </Link>
        </Button>
      </div>
      <PageHeader
        title={goal.title}
        description={
          goal.targetDate ? `Target date ${formatLocalDate(goal.targetDate)}` : undefined
        }
        actions={<GoalFormDialog goal={goal} today={today} />}
      />

      <GoalReleaseNotes
        notes={goalReleaseNotes(mergeLedger(ledger, spending), goals, versions).filter(
          (n) => n.goalId === goal.id,
        )}
        currency={profile.currency}
      />

      <GoalStatusActions
        goalId={goal.id}
        title={goal.title}
        status={goal.status}
        reachedTarget={progress.completed}
        savedPaise={progress.savedPaise}
        currency={profile.currency}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="min-w-0 gap-4 lg:col-span-3">
          <div className="flex items-center gap-4">
            <ProgressRing bp={done ? 10_000 : progress.progressBp} size={104}>
              <CategoryBadge icon={goal.icon ?? "piggy-bank"} color={null} />
            </ProgressRing>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className="tabular text-3xl font-semibold tracking-tight"
                  data-testid="goal-saved"
                >
                  {money(progress.savedPaise)}
                </p>
                {goal.status !== "active" && (
                  <Badge variant={done ? "positive" : "outline"}>
                    {{ paused: "Paused", completed: "Complete", archived: "Archived" }[goal.status]}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                set aside of {money(goal.targetPaise)} · {formatBasisPoints(progress.progressBp, 0)}
              </p>
            </div>
          </div>
          {progress.completed && goal.status === "active" && (
            <p
              className="flex items-center gap-2 rounded-lg bg-positive-soft p-3 text-sm"
              data-testid="goal-reached"
            >
              <PartyPopper className="size-4 shrink-0 text-positive" aria-hidden="true" />
              You’ve reached your target. Mark it complete when you’re ready.
            </p>
          )}
          <dl className="divide-y">
            <FigureRow
              label="Remaining"
              value={money(progress.remainingPaise)}
              testId="goal-remaining"
            />
            <FigureRow
              label={`Suggested per ${CADENCE_WORD[cadence]}`}
              value={progress.suggested ? money(progress.suggested.amountPaise) : "—"}
              explanation={progress.explanation}
            />
            {forecast && (
              <FigureRow
                label="At your pace so far"
                value={formatLocalDate(forecast.reachedOn)}
                explanation={`About ${money(forecast.dailyPacePaise)} a day since your first allocation. An estimate, not a promise.`}
              />
            )}
          </dl>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {goal.status === "active" && (
              <GoalMoveDialog
                goalId={goal.id}
                title={goal.title}
                moveType="allocation"
                savedPaise={progress.savedPaise}
                flexiblePaise={result.flexiblePaise}
                currency={profile.currency}
              />
            )}
            {progress.savedPaise > 0 && (
              <GoalMoveDialog
                goalId={goal.id}
                title={goal.title}
                moveType="allocation_release"
                savedPaise={progress.savedPaise}
                flexiblePaise={result.flexiblePaise}
                currency={profile.currency}
                variant="outline"
              />
            )}
            {(live || done) && (
              <GoalPurchaseDialog
                goalId={goal.id}
                title={goal.title}
                savedPaise={progress.savedPaise}
                targetPaise={goal.targetPaise}
                kit={kit}
              />
            )}
          </div>
          {goal.status === "paused" && (
            <PlanNote>Resume this goal to set more aside. Its money stays set aside.</PlanNote>
          )}
          <PlanNote>
            Setting money aside lowers what’s safe to spend, not your tracked balance. Bought what
            you saved for? “I bought it” records the real expense and releases the money in one
            step, so it’s subtracted once.
          </PlanNote>
        </Card>

        <Card className="min-w-0 gap-2 lg:col-span-2">
          <h2 className="font-semibold">History</h2>
          {moves.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing set aside yet. Every allocation and release will show here.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col" data-testid="goal-history">
              {moves.map((tx) => (
                <li key={tx.id}>
                  <Link
                    href={`/transactions/${tx.id}`}
                    className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/50"
                  >
                    {tx.type === "allocation" ? (
                      <ArrowDownLeft className="size-4 text-positive" aria-hidden="true" />
                    ) : (
                      <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {tx.note === PURCHASE_RELEASE_NOTE
                          ? tx.note
                          : `${tx.type === "allocation" ? "Set aside" : "Released"}${tx.note ? ` · ${tx.note}` : ""}`}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(tx.occurredAt, profile.timeZone)}
                      </span>
                    </span>
                    <span className="tabular text-sm font-medium">
                      {tx.type === "allocation" ? "+" : "−"}
                      {money(tx.amountPaise)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Earmarks only. These are never income or spending.
          </p>
        </Card>
      </div>
    </>
  );
}
