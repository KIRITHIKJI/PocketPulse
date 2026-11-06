"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { useDialogAction } from "@/components/forms/use-dialog-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveGoal } from "@/lib/actions/goals";
import { paiseToInput } from "@/lib/format";
import { newId } from "@/lib/ids";

const GOAL_ICONS = [
  ["piggy-bank", "Piggy bank"],
  ["laptop", "Laptop"],
  ["smartphone", "Phone"],
  ["bike", "Bike"],
  ["plane", "Trip"],
  ["graduation-cap", "Studies"],
  ["gift", "Gift"],
  ["music", "Music"],
  ["heart", "Something I love"],
  ["house", "Home"],
] as const;

interface EditableGoal {
  id: string;
  title: string;
  icon: string | null;
  targetPaise: number;
  targetDate: string | null;
}

export function GoalFormDialog({ goal, today }: { goal?: EditableGoal; today: string }) {
  const editing = Boolean(goal);
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(saveGoal);
  // New for each opening: within one, a double submit saves one goal; the next add is another.
  const [newGoalId, setNewGoalId] = React.useState(newId);
  const [icon, setIcon] = React.useState(goal?.icon ?? GOAL_ICONS[0][0]);
  const err = state.fieldErrors ?? {};
  const prefix = goal ? `goal-${goal.id}` : "goal-new";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setNewGoalId(newId());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline">
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Add goal
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${goal!.title}` : "Add a savings goal"}</DialogTitle>
          <DialogDescription>
            A goal is a pocket inside your tracked money. Setting money aside isn’t spending.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={goal?.id ?? newGoalId} />
          <FormMessage state={state} />
          <Field
            id={`${prefix}-title`}
            name="title"
            label="What are you saving for?"
            defaultValue={goal?.title ?? ""}
            maxLength={80}
            autoComplete="off"
            required
            error={err.title}
          />
          <div className="flex items-end gap-3">
            <CategoryBadge icon={icon} color={null} />
            <SelectField
              id={`${prefix}-icon`}
              name="icon"
              label="Icon"
              className="flex-1"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              error={err.icon}
            >
              {GOAL_ICONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              id={`${prefix}-target`}
              name="target"
              label="Target amount"
              defaultValue={paiseToInput(goal?.targetPaise ?? null)}
              required
              error={err.target}
            />
            <Field
              id={`${prefix}-date`}
              name="targetDate"
              label="Target date"
              type="date"
              min={today}
              defaultValue={goal?.targetDate ?? ""}
              hint="Optional. It’s used to suggest an amount."
              error={err.targetDate}
            />
          </div>
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {editing ? "Save changes" : "Add goal"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
