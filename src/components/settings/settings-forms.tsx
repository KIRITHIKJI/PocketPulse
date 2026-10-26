"use client";

import * as React from "react";
import { Info } from "lucide-react";

import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { SwitchRow } from "@/components/ui/switch";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "@/domain";
import {
  saveIncome,
  savePrivacy,
  saveProfileName,
  saveRegion,
  saveReminders,
  saveSpending,
} from "@/lib/actions/settings";
import { type FormState, IDLE } from "@/lib/forms";
import { paiseToInput } from "@/lib/format";
import type { IncomeFrequency, ReminderKey, ReminderPreferences } from "@/lib/validation/settings";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
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
function SettingsForm({
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

type StepProps = { next?: string; submitLabel?: string; footer?: React.ReactNode };

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

const REMINDER_LABELS: Record<ReminderKey, { label: string; description: string }> = {
  missedLogging: {
    label: "Forgot to log today",
    description: "An evening nudge on days with no entries.",
  },
  weeklyReview: { label: "Weekly review", description: "A look back at your week." },
  upcomingIncome: {
    label: "Allowance coming up",
    description: "Before your next expected income date.",
  },
  budgetAlerts: {
    label: "Budget thresholds",
    description: "When a budget reaches 50 %, 80 % or 100 %.",
  },
  upcomingCommitments: {
    label: "Bills and planned expenses",
    description: "Before something you planned is due.",
  },
  savingsReview: { label: "Savings check-in", description: "Progress on your goals." },
};

export function RemindersFields({ prefs }: { prefs: ReminderPreferences }) {
  const [allDisabled, setAllDisabled] = React.useState(prefs.allDisabled);
  return (
    <div className="flex flex-col">
      <SwitchRow
        id="reminder-allDisabled"
        name="allDisabled"
        label="Turn off all reminders"
        description="Nothing is sent while this is on. Reminders appear inside PocketPulse; nothing is emailed."
        checked={allDisabled}
        onCheckedChange={setAllDisabled}
      />
      {/* Kept editable while everything is off, so individual choices survive turning it back on. */}
      <div
        className={
          allDisabled
            ? "flex flex-col divide-y border-t opacity-60"
            : "flex flex-col divide-y border-t"
        }
      >
        {(Object.keys(REMINDER_LABELS) as ReminderKey[]).map((key) => (
          <SwitchRow
            key={key}
            id={`reminder-${key}`}
            name={key}
            label={REMINDER_LABELS[key].label}
            description={
              allDisabled
                ? `${REMINDER_LABELS[key].description} Paused while all reminders are off.`
                : REMINDER_LABELS[key].description
            }
            defaultChecked={prefs[key]}
          />
        ))}
      </div>
    </div>
  );
}

export function RemindersForm({ prefs, ...step }: { prefs: ReminderPreferences } & StepProps) {
  return (
    <SettingsForm action={saveReminders} {...step}>
      {() => <RemindersFields prefs={prefs} />}
    </SettingsForm>
  );
}

export function PrivacyFields({ includeNotesInReports }: { includeNotesInReports: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        id="privacy-notes"
        name="includeNotesInReports"
        label="Include notes in parent reports by default"
        description="You still review every report before exporting it, and can change this per report."
        defaultChecked={includeNotesInReports}
      />
      <ul className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
        {[
          "Your entries are private to your account. Nothing is shared with parents or anyone else unless you export it yourself.",
          "Expense details are never sent to an AI service. Suggestions and text parsing run inside PocketPulse.",
          "Balances are what you enter. PocketPulse isn’t connected to any bank and doesn’t verify them.",
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrivacyForm({
  includeNotesInReports,
  ...step
}: { includeNotesInReports: boolean } & StepProps) {
  return (
    <SettingsForm action={savePrivacy} {...step}>
      {() => <PrivacyFields includeNotesInReports={includeNotesInReports} />}
    </SettingsForm>
  );
}
