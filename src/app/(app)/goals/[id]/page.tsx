import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, PartyPopper, PiggyBank } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { GoalStatusActions } from "@/components/plan/goal-actions";
import { GoalPurchaseDialog } from "@/components/plan/goal-purchase-dialog";
import { GoalMoveDialog } from "@/components/plan/goal-move-dialog";
import { GoalFormDialog } from "@/components/plan/goal-form";
import { GoalReleaseNotes } from "@/components/plan/goal-release-notes";
import { FigureRow, PlanNote, ProgressRing } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
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
import { cn } from "@/lib/utils";

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

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <Surface variant="hero" className="min-w-0 lg:col-span-3">
          <div className="flex items-center gap-4">
            <ProgressRing bp={done ? 10_000 : progress.progressBp} size={104} tone="earmark">
              <CategoryBadge icon={goal.icon ?? "piggy-bank"} color={null} />
            </ProgressRing>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-display text-money-earmark money" data-testid="goal-saved">
                  {money(progress.savedPaise)}
                </p>
                {goal.status !== "active" && (
                  <Badge variant={done ? "positive" : "outline"}>
                    {{ paused: "Paused", completed: "Complete", archived: "Archived" }[goal.status]}
                  </Badge>
                )}
              </div>
              <p className="type-body text-text-secondary">
                set aside, still yours · of <span className="money">{money(goal.targetPaise)}</span>{" "}
                · <span className="money">{formatBasisPoints(progress.progressBp, 0)}</span>
              </p>
            </div>
          </div>
          {progress.completed && goal.status === "active" && (
            <div data-testid="goal-reached">
              <Notice tone="success" icon={PartyPopper}>
                You’ve reached your target. Mark it complete when you’re ready.
              </Notice>
            </div>
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
                explanation={
                  <>
                    About <span className="money">{money(forecast.dailyPacePaise)}</span> a day
                    since your first allocation. An estimate, not a promise.
                  </>
                }
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
            <Notice tone="info">
              Resume this goal to set more aside. Its money stays set aside.
            </Notice>
          )}
          <PlanNote>
            Setting money aside lowers what’s safe to spend, not your tracked balance. Bought what
            you saved for? “I bought it” records the real expense and releases the money in one
            step, so it’s subtracted once.
          </PlanNote>
        </Surface>

        <Surface className="min-w-0 lg:col-span-2">
          <SurfaceHeader
            title="History"
            meta="Earmarks only. These are never income or spending."
          />
          {moves.length === 0 ? (
            <StatePanel
              size="section"
              icon={PiggyBank}
              title="Nothing set aside yet"
              description="Every allocation and release will show here."
            />
          ) : (
            <ul className="-mx-2 flex flex-col divide-y" data-testid="goal-history">
              {moves.map((tx) => {
                const allocation = tx.type === "allocation";
                return (
                  <li key={tx.id}>
                    <Link
                      href={`/transactions/${tx.id}`}
                      className="flex min-h-14 items-center gap-3 rounded-md px-2 py-2 transition-colors duration-(--duration-quick) outline-none hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:min-h-12"
                    >
                      {allocation ? (
                        <ArrowDownLeft
                          className="size-4 shrink-0 text-money-earmark"
                          aria-hidden="true"
                        />
                      ) : (
                        <ArrowUpRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-body font-medium">
                          {tx.note === PURCHASE_RELEASE_NOTE
                            ? tx.note
                            : `${allocation ? "Set aside" : "Released"}${tx.note ? ` · ${tx.note}` : ""}`}
                        </span>
                        <span className="block type-caption text-muted-foreground">
                          {formatDateTime(tx.occurredAt, profile.timeZone)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 type-body font-medium money",
                          allocation ? "text-money-earmark" : "text-text-secondary",
                        )}
                      >
                        {money(tx.amountPaise)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </div>
    </>
  );
}
