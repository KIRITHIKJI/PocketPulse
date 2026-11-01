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

/** The two inputs this screen owns: the next income date (shared with Settings) and the reserve. */
export function PlanningForm({
  nextIncomeDate,
  reservePaise,
  today,
}: {
  nextIncomeDate: string | null;
  reservePaise: number;
  today: string;
}) {
  const [state, formAction, pending] = React.useActionState(savePlanning, IDLE);
  const err = state.fieldErrors ?? {};
  return (
    <ActionForm action={formAction} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="plan-next-income"
          name="nextIncomeDate"
          label="Next income date"
          type="date"
          min={today}
          defaultValue={nextIncomeDate ?? ""}
          error={err.nextIncomeDate}
        />
        <MoneyField
          id="plan-reserve"
          name="reserve"
          label="Minimum reserve"
          defaultValue={reservePaise > 0 ? paiseToInput(reservePaise) : ""}
          hint="Optional. Money you’d rather not touch."
          error={err.reserve}
        />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" size="default" className="self-start">
        Save
      </SubmitButton>
    </ActionForm>
  );
}
