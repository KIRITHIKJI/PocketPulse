"use client";

import * as React from "react";

import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/domain";
import { saveIncome, saveProfileName, saveRegion, saveSpending } from "@/lib/actions/settings";
import { type FormState, IDLE } from "@/lib/forms";
import { paiseToInput } from "@/lib/format";
import { type IncomeFrequency } from "@/lib/validation/settings";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  INR: "Indian rupee (₹)",
  USD: "US dollar ($)",
  EUR: "Euro (€)",
  GBP: "British pound (£)",
  AED: "UAE dirham (AED)",
  SGD: "Singapore dollar (S$)",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  weekly: "Every week",
  biweekly: "Every two weeks",
  monthly: "Every month",
  irregular: "Now and then (irregular)",
  none: "I don’t get regular money",
};

/**
 * Settings and onboarding render the same forms. In onboarding `next` is the following step;
 * the server validates it and continues there after saving.
 */
export function SettingsForm({
  action,
  next,
  submitLabel = "Save",
  children,
  footer,
}: {
  action: Action;
  next?: string | undefined;
  submitLabel?: string;
  children: (state: FormState) => React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [state, formAction, pending] = React.useActionState(action, IDLE);
  return (
    <ActionForm action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      {children(state)}
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} pendingLabel="Saving…" size={next ? "lg" : "default"}>
          {submitLabel}
        </SubmitButton>
        {footer}
      </div>
    </ActionForm>
  );
}

export type StepProps = { next?: string; submitLabel?: string; footer?: React.ReactNode };

export function ProfileNameForm({
  displayName,
  ...step
}: { displayName: string | null } & StepProps) {
  return (
    <SettingsForm action={saveProfileName} {...step}>
      {(state) => (
        <Field
          name="displayName"
          label="Your name"
          defaultValue={displayName ?? ""}
          maxLength={60}
          autoComplete="given-name"
          hint="Optional. Shown in greetings and on reports you choose to export."
          error={state.fieldErrors?.displayName}
        />
      )}
    </SettingsForm>
  );
}

export function RegionForm({
  currency,
  timeZone,
  weekStartsOn,
  timeZones,
  currencyLocked,
  ...step
}: {
  currency: CurrencyCode;
  timeZone: string;
  weekStartsOn: number;
  timeZones: string[];
  currencyLocked: boolean;
} & StepProps) {
  return (
    <SettingsForm action={saveRegion} {...step}>
      {(state) => (
        <>
          <SelectField
            name="currency"
            label="Currency"
            defaultValue={currency}
            error={state.fieldErrors?.currency}
            hint={
              currencyLocked
                ? "Locked after your first entry, so totals never mix currencies."
                : "Used for every wallet, budget and goal. You can change it until your first entry."
            }
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code} disabled={currencyLocked && code !== currency}>
                {CURRENCY_LABELS[code]}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="timeZone"
            label="Timezone"
            defaultValue={timeZone}
            error={state.fieldErrors?.timeZone}
            hint="Decides which day an entry belongs to, and when days, weeks and months start."
          >
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="weekStartsOn"
            label="Weeks start on"
            defaultValue={String(weekStartsOn)}
            error={state.fieldErrors?.weekStartsOn}
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </SelectField>
        </>
      )}
    </SettingsForm>
  );
}

export function IncomeForm({
  incomeFrequency,
  nextIncomeDate,
  expectedIncomePaise,
  today,
  ...step
}: {
  incomeFrequency: IncomeFrequency;
  nextIncomeDate: string | null;
  expectedIncomePaise: number | null;
  today: string;
} & StepProps) {
  const [frequency, setFrequency] = React.useState(incomeFrequency);
  return (
    <SettingsForm action={saveIncome} {...step}>
      {(state) => (
        <>
          <SelectField
            name="incomeFrequency"
            label="How often does money come in?"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}
            error={state.fieldErrors?.incomeFrequency}
            hint="Pocket money, an allowance, a stipend or wages."
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          {frequency !== "none" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="nextIncomeDate"
                label="Next expected on"
                type="date"
                min={today}
                defaultValue={nextIncomeDate ?? ""}
                error={state.fieldErrors?.nextIncomeDate}
                hint="Optional. Safe-to-spend uses it to spread your money until then."
              />
              <MoneyField
                name="expectedIncome"
                label="Usual amount"
                defaultValue={paiseToInput(expectedIncomePaise)}
                error={state.fieldErrors?.expectedIncome}
                hint="Optional. Only for planning — never counted until you record it."
              />
            </div>
          )}
        </>
      )}
    </SettingsForm>
  );
}

export function SpendingForm({ thresholdPaise, ...step }: { thresholdPaise: number } & StepProps) {
  return (
    <SettingsForm action={saveSpending} {...step}>
      {(state) => (
        <MoneyField
          name="smallPurchaseThreshold"
          label="Small purchase threshold"
          defaultValue={paiseToInput(thresholdPaise)}
          error={state.fieldErrors?.smallPurchaseThreshold}
          hint="Purchases under this count as “small” in insights and the Money Leak Detector. Default ₹50."
        />
      )}
    </SettingsForm>
  );
}
