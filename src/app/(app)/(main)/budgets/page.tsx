import type { Metadata } from "next";
import { Bell, Target, Trash2 } from "lucide-react";

import { ConfirmAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { BudgetFormDialog, type BudgetSuggestion } from "@/components/plan/budget-form";
import { BudgetRemaining, Meter, PlanNote } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type Budget,
  type BudgetEvaluation,
  type Period,
  type TimeSettings,
  budgetAlert,
  evaluateBudget,
  formatBasisPoints,
  moneyFormatter,
  previousPeriod,
  resolvePeriod,
  SUGGESTION_MONTHS,
  suggestMonthlyLimit,
  toLocalDate,
} from "@/domain";
import { archiveBudget } from "@/lib/actions/budgets";
import {
  getAccounts,
  getBudgets,
  getCategories,
  getLedgerSince,
  getProfile,
  getReminderPreferences,
  withBudgetPeriods,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant, startForAnyZone } from "@/lib/data/slices";
import { formatLocalDate } from "@/lib/format";
import { mainExpenseCategories } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Budgets" };

const STATUS: Record<
  BudgetEvaluation["status"],
  { label: string; variant: "default" | "positive" | "warning" | "outline" }
> = {
  not_started: { label: "Not started", variant: "outline" },
  on_track: { label: "On pace", variant: "positive" },
  over_pace: { label: "Ahead of pace", variant: "warning" },
  exceeded: { label: "Over target", variant: "warning" },
  ended: { label: "Ended", variant: "outline" },
};

function periodText(budget: Budget, evaluation: BudgetEvaluation) {
  const from = formatLocalDate(evaluation.period.startDate!);
  const to = formatLocalDate(evaluation.period.endDate!);
  const label = { monthly: "Monthly", weekly: "Weekly", custom: "Custom" }[budget.period];
  return `${label} · ${from} to ${to}`;
}

/** This week and month, the ones before them, and the months a suggested limit looks at. */
function periodsFor(now: number, settings: TimeSettings): (Period | null)[] {
  const week = resolvePeriod({ kind: "this_week" }, now, settings);
  const months: (Period | null)[] = [resolvePeriod({ kind: "this_month" }, now, settings)];
  for (let i = 0; i < SUGGESTION_MONTHS; i++) {
    const last = months.at(-1);
    months.push(last ? previousPeriod(last) : null);
  }
  return [week, previousPeriod(week), ...months];
}

export default async function BudgetsPage() {
  const now = requestNow();
  const since = startForAnyZone((settings) => periodsFor(now, settings))!;
  const [profile, budgets, categories, window, accounts, reminders] = await Promise.all([
    getProfile(),
    getBudgets(),
    getCategories(),
    getLedgerSince(isoInstant(since)),
    getAccounts(),
    getReminderPreferences(),
  ]);
  const ledger = await withBudgetPeriods(window, since, budgets, now);
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const today = toLocalDate(now, profile.timeZone);
  const money = moneyFormatter(profile.currency);

  const mains = mainExpenseCategories(categories);
  const pickable = mains.map((c) => ({ id: c.id, name: c.name }));
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const trackingStart = accounts.map((a) => a.openingBalanceDate).sort()[0];
  const suggestions: BudgetSuggestion[] = [
    { id: "", categoryId: null },
    ...mains.map((c) => ({ id: c.id, categoryId: c.id as string | null })),
  ].flatMap(({ id, categoryId }) => {
    const suggestion = suggestMonthlyLimit(ledger, today, {
      categoryId,
      settings,
      money,
      ...(trackingStart ? { trackingStart } : {}),
    });
    return suggestion ? [{ scope: id, ...suggestion }] : [];
  });

  const rows = budgets
    .map((budget) => {
      const evaluation = evaluateBudget(budget, ledger, now, settings, undefined, money);
      const before = previousPeriod(evaluation.period);
      const previous =
        budget.period !== "custom" && before
          ? evaluateBudget(budget, ledger, now, settings, before, money)
          : null;
      return {
        budget,
        evaluation,
        previous,
        label: budget.categoryId ? (names.get(budget.categoryId) ?? "Category") : "All spending",
      };
    })
    // The total comes first; then whatever is closest to its limit.
    .sort(
      (a, b) =>
        Number(a.budget.categoryId !== null) - Number(b.budget.categoryId !== null) ||
        b.evaluation.usedBp - a.evaluation.usedBp,
    );

  const alertsOn = !reminders.allDisabled && reminders.budgetAlerts;
  const alerts = alertsOn
    ? rows.flatMap((row) => {
        const alert = budgetAlert(row.evaluation);
        return alert ? [{ ...alert, label: row.label }] : [];
      })
    : [];

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Targets for your total spending and each category. They guide you and never block a purchase."
        actions={<BudgetFormDialog categories={pickable} suggestions={suggestions} today={today} />}
      />
      <SectionTabs section="plan" />

      {rows.length === 0 ? (
        <StatePanel
          icon={Target}
          title="No budgets set"
          description="Set a total or per-category limit and track spent, remaining and pace. A budget is a target, not reserved money."
        />
      ) : (
        <>
          {alerts.length > 0 && (
            <section
              aria-label="Budget alerts"
              className="flex flex-col gap-2"
              data-testid="budget-alerts"
            >
              {alerts.map((alert) => (
                <p
                  key={alert.budgetId}
                  className="flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm"
                >
                  <Bell className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  {alert.exceeded
                    ? `${alert.label} is over its target, at ${formatBasisPoints(alert.usedBp, 0)}. That’s worth knowing; nothing is blocked.`
                    : `${alert.label} has reached ${formatBasisPoints(alert.thresholdBp, 0)} of its target.`}
                </p>
              ))}
            </section>
          )}

          <ul className="grid gap-4 lg:grid-cols-2">
            {rows.map(({ budget, evaluation, previous, label }) => {
              const status = STATUS[evaluation.status];
              return (
                <li key={budget.id} className="min-w-0">
                  <Card className="h-full gap-3" data-testid="budget-card">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{label}</h2>
                        <p className="text-xs text-muted-foreground">
                          {periodText(budget, evaluation)}
                        </p>
                      </div>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="tabular text-sm">
                      <span className="text-xl font-semibold" data-testid="budget-spent">
                        {money(Math.max(0, evaluation.spentPaise))}
                      </span>{" "}
                      of {money(evaluation.limitPaise)} ·{" "}
                      <span data-testid="budget-used">
                        {formatBasisPoints(evaluation.usedBp, 0)}
                      </span>{" "}
                      used
                    </p>
                    <Meter
                      bp={evaluation.usedBp}
                      tone={
                        evaluation.status === "exceeded" || evaluation.status === "over_pace"
                          ? "warning"
                          : "primary"
                      }
                    />
                    <BudgetRemaining remainingPaise={evaluation.remainingPaise} money={money} />
                    <p className="text-xs text-muted-foreground">
                      {formatBasisPoints(evaluation.elapsedBp, 0)} of the period has passed.
                      {evaluation.projectedPaise !== null &&
                      evaluation.status !== "ended" &&
                      evaluation.status !== "not_started"
                        ? ` At this pace: about ${money(evaluation.projectedPaise)}.`
                        : ""}
                      {previous
                        ? ` Last ${budget.period === "weekly" ? "week" : "month"}: ${money(Math.max(0, previous.spentPaise))} of ${money(previous.limitPaise)}.`
                        : ""}
                    </p>
                    <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2">
                      <BudgetFormDialog
                        budget={{ ...budget, label }}
                        categories={pickable}
                        suggestions={suggestions}
                        today={today}
                      />
                      <ConfirmAction
                        action={archiveBudget}
                        fields={{ id: budget.id }}
                        trigger={
                          <Button variant="ghost" size="sm" aria-label={`Remove ${label} budget`}>
                            <Trash2 aria-hidden="true" />
                            Remove
                          </Button>
                        }
                        title={`Remove the ${label} budget?`}
                        description={
                          <p>
                            This removes the target only. Your entries and balance don’t change.
                          </p>
                        }
                        confirmLabel="Remove budget"
                        pendingLabel="Removing…"
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <PlanNote>
            Budgets are targets, not reserved money. They don’t change your balance or
            safe-to-spend.
            {!alertsOn ? " Budget alerts are off in Settings." : ""}
          </PlanNote>
        </>
      )}
    </>
  );
}
