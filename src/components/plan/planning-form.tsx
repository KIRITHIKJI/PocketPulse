"use client";

import * as React from "react";

import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { savePlanning } from "@/lib/actions/recurring";
import { paiseToInput } from "@/lib/format";
import { IDLE } from "@/lib/forms";
import { cn } from "@/lib/utils";

const useSavePlanning = () => React.useActionState(savePlanning, IDLE);

type PlanningState = ReturnType<typeof useSavePlanning>;

const PlanningContext = React.createContext<PlanningState | null>(null);

/**
 * Holds the form's result above the page, so a form that moves after saving (from the "add your
 * income date" panel to the planning card) still says "Saved." instead of starting blank.
 */
export function PlanningFormState({ children }: { children: React.ReactNode }) {
  const value = useSavePlanning();
  return <PlanningContext value={value}>{children}</PlanningContext>;
}

/**
 * The two inputs this screen owns: the next income date (shared with Settings) and the reserve.
 * `dateOnly` shows just the date; the saved reserve goes back unchanged with it.
 */
export function PlanningForm({
  nextIncomeDate,
  reservePaise,
  today,
  dateOnly = false,
}: {
  nextIncomeDate: string | null;
  reservePaise: number;
  today: string;
  dateOnly?: boolean;
}) {
  const own = useSavePlanning();
  const [state, formAction, pending] = React.useContext(PlanningContext) ?? own;
  const err = state.fieldErrors ?? {};
  const reserve = reservePaise > 0 ? paiseToInput(reservePaise) : "";
  return (
    <ActionForm action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className={cn("grid gap-4", !dateOnly && "sm:grid-cols-2")}>
        <Field
          id="plan-next-income"
          name="nextIncomeDate"
          label="Next income date"
          type="date"
          min={today}
          defaultValue={nextIncomeDate ?? ""}
          error={err.nextIncomeDate}
        />
        {dateOnly ? (
          <input type="hidden" name="reserve" value={reserve} />
        ) : (
          <MoneyField
            id="plan-reserve"
            name="reserve"
            label="Minimum reserve"
            defaultValue={reserve}
            hint="Optional. Money you’d rather not touch."
            error={err.reserve}
          />
        )}
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" size="default" className="self-start">
        Save
      </SubmitButton>
    </ActionForm>
  );
}
