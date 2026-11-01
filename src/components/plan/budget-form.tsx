"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";

import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { useDialogAction } from "@/components/forms/use-dialog-action";
import { PlanNote } from "@/components/plan/parts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveBudget } from "@/lib/actions/budgets";
import { paiseToInput } from "@/lib/format";
import { newId } from "@/lib/ids";

export interface EditableBudget {
  id: string;
  label: string;
  categoryId: string | null;
  limitPaise: number;
  period: "weekly" | "monthly" | "custom";
  customFrom: string | null;
  customTo: string | null;
  alertThresholdsBp: number[];
}

export interface BudgetSuggestion {
  /** "" for the total budget. */
  scope: string;
  limitPaise: number;
  explanation: string;
}

const PERIOD_LABELS = { monthly: "Every month", weekly: "Every week", custom: "Custom dates" };

/** Create or edit a budget. Suggested limits come from the user's own complete months. */
export function BudgetFormDialog({
  budget,
  categories,
  suggestions,
  today,
}: {
  budget?: EditableBudget;
  categories: { id: string; name: string }[];
  suggestions: BudgetSuggestion[];
  today: string;
}) {
  const editing = Boolean(budget);
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(saveBudget);
  // New for each opening: within one, a double submit saves one budget; the next add is another.
  const [newBudgetId, setNewBudgetId] = React.useState(newId);
  const [scope, setScope] = React.useState(budget?.categoryId ?? "");
  const [period, setPeriod] = React.useState<EditableBudget["period"]>(budget?.period ?? "monthly");
  const [limit, setLimit] = React.useState(paiseToInput(budget?.limitPaise ?? null));
  const err = state.fieldErrors ?? {};
  const prefix = budget ? `budget-${budget.id}` : "budget-new";
  const suggestion = suggestions.find((s) => s.scope === scope);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setNewBudgetId(newId());
      setScope(budget?.categoryId ?? "");
      setPeriod(budget?.period ?? "monthly");
      setLimit(paiseToInput(budget?.limitPaise ?? null));
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${budget!.label} budget`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Add budget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${budget!.label} budget` : "Add a budget"}</DialogTitle>
          <DialogDescription>
            A budget is a target for your spending. It never blocks a purchase and doesn’t reserve
            any money.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={budget?.id ?? newBudgetId} />
          <FormMessage state={state} />
          <SelectField
            id={`${prefix}-scope`}
            name="categoryId"
            label="Budget for"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            error={err.categoryId}
          >
            <option value="">All spending</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <MoneyField
            id={`${prefix}-limit`}
            name="limit"
            label="Limit"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            required
            error={err.limit}
          />
          {period === "monthly" &&
            (suggestion ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 p-3 text-xs">
                <p className="min-w-0 flex-1 text-muted-foreground">{suggestion.explanation}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit(paiseToInput(suggestion.limitPaise))}
                >
                  Use suggestion
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                A suggestion appears after one complete month of spending here.
              </p>
            ))}
          <SelectField
            id={`${prefix}-period`}
            name="period"
            label="Period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as EditableBudget["period"])}
            error={err.period}
          >
            {Object.entries(PERIOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          {period === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id={`${prefix}-from`}
                name="customFrom"
                label="From"
                type="date"
                defaultValue={budget?.customFrom ?? today}
                error={err.customFrom}
              />
              <Field
                id={`${prefix}-to`}
                name="customTo"
                label="To"
                type="date"
                defaultValue={budget?.customTo ?? ""}
                error={err.customTo}
              />
            </div>
          )}
          <Field
            id={`${prefix}-thresholds`}
            name="thresholds"
            label="Alert me at (% used)"
            defaultValue={(budget?.alertThresholdsBp ?? [5_000, 8_000, 10_000])
              .map((bp) => bp / 100)
              .join(", ")}
            autoComplete="off"
            hint="Up to 5 whole percents. Leave blank for no alerts."
            error={err.thresholds}
          />
          <PlanNote>
            Spent is expenses minus refunds, so editing an old entry updates this budget straight
            away.
          </PlanNote>
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {editing ? "Save changes" : "Add budget"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
