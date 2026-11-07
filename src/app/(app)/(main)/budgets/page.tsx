import type { Metadata } from "next";
import { Target, Trash2 } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { ConfirmAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { BudgetFormDialog, type BudgetSuggestion } from "@/components/plan/budget-form";
import { BudgetRemaining, PlanNote } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress, type ProgressTone } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
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
import { cn } from "@/lib/utils";

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

/** Over the limit is red; past an alert level or ahead of pace is amber; otherwise green. */
function progressTone(evaluation: BudgetEvaluation): ProgressTone {
  if (evaluation.usedBp > 10_000) return "over";
  if (evaluation.status === "over_pace" || evaluation.status === "exceeded") return "warning";
  return evaluation.reachedThresholdsBp.length > 0 ? "warning" : "money";
}

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
  type Row = (typeof rows)[number];

  const alertsOn = !reminders.allDisabled && reminders.budgetAlerts;
  const alerts = alertsOn
    ? rows.flatMap((row) => {
        const alert = budgetAlert(row.evaluation);
        return alert ? [{ ...alert, label: row.label }] : [];
      })
    : [];

  // The monthly total is the screen's main figure; without one, another total budget takes it.
  const totals = rows.filter((row) => row.budget.categoryId === null);
  const hero = totals.find((row) => row.budget.period === "monthly") ?? totals[0] ?? null;
  const rest = rows.filter((row) => row !== hero);
  const totalSuggestion = suggestions.find((s) => s.scope === "");

  const actions = (row: Row) => (
    <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2">
      <BudgetFormDialog
        budget={{ ...row.budget, label: row.label }}
        categories={pickable}
        suggestions={suggestions}
        today={today}
      />
      <ConfirmAction
        action={archiveBudget}
        fields={{ id: row.budget.id }}
        trigger={
          <Button variant="ghost" size="sm" aria-label={`Remove ${row.label} budget`}>
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        }
        title={`Remove the ${row.label} budget?`}
        description={<p>This removes the target only. Your entries and balance don’t change.</p>}
        confirmLabel="Remove budget"
        pendingLabel="Removing…"
      />
    </div>
  );

  const pace = ({ budget, evaluation, previous }: Row) => (
    <p className="type-caption text-muted-foreground">
      {formatBasisPoints(evaluation.elapsedBp, 0)} of the period has passed.
      {evaluation.projectedPaise !== null &&
      evaluation.status !== "ended" &&
      evaluation.status !== "not_started" ? (
        <>
          {" "}
          At this pace: about <span className="money">{money(evaluation.projectedPaise)}</span>.
        </>
      ) : null}
      {previous ? (
        <>
          {" "}
          Last {budget.period === "weekly" ? "week" : "month"}:{" "}
          <span className="money">{money(Math.max(0, previous.spentPaise))}</span> of{" "}
          <span className="money">{money(previous.limitPaise)}</span>.
        </>
      ) : null}
    </p>
  );

  /** One budget. The hero shows its spending as the screen's one display figure. */
  const budgetCard = (row: Row, main: boolean) => {
    const { budget, evaluation, label } = row;
    const status = STATUS[evaluation.status];
    const Heading = main ? "h2" : "h3";
    const used = formatBasisPoints(evaluation.usedBp, 0);
    return (
      <Surface variant={main ? "hero" : "card"} className="h-full" data-testid="budget-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Heading className="truncate type-heading">{label}</Heading>
            <p className="type-caption text-text-secondary">{periodText(budget, evaluation)}</p>
          </div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <p className="type-body text-text-secondary">
          <span
            className={cn("text-foreground money", main ? "type-display" : "type-heading")}
            data-testid="budget-spent"
          >
            {money(Math.max(0, evaluation.spentPaise))}
          </span>{" "}
          of <span className="money">{money(evaluation.limitPaise)}</span> ·{" "}
          <span className="money" data-testid="budget-used">
            {used}
          </span>{" "}
          used
        </p>
        <Progress
          bp={evaluation.usedBp}
          tone={progressTone(evaluation)}
          aria-label={`${label} budget used`}
          valueText={`${used} used`}
        />
        <BudgetRemaining remainingPaise={evaluation.remainingPaise} money={money} />
        {pace(row)}
        {actions(row)}
      </Surface>
    );
  };

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Targets for your spending. They guide you and never block a purchase."
        actions={
          rows.length > 0 ? (
            <BudgetFormDialog categories={pickable} suggestions={suggestions} today={today} />
          ) : undefined
        }
      />
      <SectionTabs section="plan" />

      {rows.length === 0 ? (
        <StatePanel
          icon={Target}
          title="Set a monthly budget"
          description={
            <>
              Set a total or per-category target and see spent, remaining and pace. A budget is a
              target, not reserved money.
              {totalSuggestion ? (
                <>
                  {" "}
                  Your last full month suggests about{" "}
                  <span className="money">{money(totalSuggestion.limitPaise)}</span>.
                </>
              ) : null}
            </>
          }
          actions={
            <>
              <BudgetFormDialog categories={pickable} suggestions={suggestions} today={today} />
              {totalSuggestion ? (
                <BudgetFormDialog
                  categories={pickable}
                  suggestions={suggestions}
                  today={today}
                  startFromSuggestion
                />
              ) : null}
            </>
          }
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
                <Notice key={alert.budgetId} tone="warning">
                  {alert.exceeded
                    ? `${alert.label} is over its target, at ${formatBasisPoints(alert.usedBp, 0)}. That’s worth knowing; nothing is blocked.`
                    : `${alert.label} has reached ${formatBasisPoints(alert.thresholdBp, 0)} of its target.`}
                </Notice>
              ))}
            </section>
          )}

          {hero ? budgetCard(hero, true) : null}

          {rest.length > 0 && (
            <section aria-labelledby="budgets-rest" className="flex flex-col gap-stack">
              <h2 id="budgets-rest" className="type-heading">
                {hero ? "Other budgets" : "Your budgets"}
              </h2>
              <ul className="grid gap-4 lg:grid-cols-2">
                {rest.map((row) => (
                  <li key={row.budget.id} className="min-w-0">
                    {budgetCard(row, false)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <PlanNote>
            Budgets don’t change your balance or safe-to-spend; no money is held for them.
            {!alertsOn ? " Budget alerts are off in Settings." : ""}
          </PlanNote>
        </>
      )}
    </>
  );
}
