"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { OpeningBalanceNote } from "@/components/accounts/account-form";
import { CategoryBadge } from "@/components/categories/category-icon";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { PrivacyFields, RemindersFields } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { ACCOUNT_KINDS } from "@/domain";
import {
  saveBalancesStep,
  saveBudgetsStep,
  saveGoalStep,
  savePreferencesStep,
} from "@/lib/actions/onboarding";
import { IDLE } from "@/lib/forms";
import { paiseToInput } from "@/lib/format";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";
import { MAX_EXTRA_ACCOUNTS } from "@/lib/validation/onboarding";
import type { ReminderPreferences } from "@/lib/validation/settings";

type ExtraRow = { id: string; name: string; kind: string; balance: string; saved: boolean };

function Actions({
  pending,
  label,
  footer,
}: {
  pending: boolean;
  label: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {label}
      </SubmitButton>
      {footer}
    </div>
  );
}

export function BalancesStepForm({
  next,
  footer,
  defaultWallet,
  extras,
  today,
}: {
  next: string;
  footer?: React.ReactNode;
  defaultWallet: { name: string; openingBalancePaise: number; openingBalanceDate: string };
  extras: { id: string; name: string; kind: string; openingBalancePaise: number }[];
  today: string;
}) {
  const [state, formAction, pending] = React.useActionState(saveBalancesStep, IDLE);
  const [rows, setRows] = React.useState<ExtraRow[]>(() =>
    extras.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      balance: paiseToInput(e.openingBalancePaise),
      saved: true,
    })),
  );
  const err = state.fieldErrors ?? {};
  const addRow = () =>
    setRows((r) => [
      ...r,
      { id: crypto.randomUUID(), name: "", kind: "bank", balance: "", saved: false },
    ]);

  return (
    <ActionForm action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <Field
        name="openingDate"
        label="Balances as of"
        type="date"
        defaultValue={defaultWallet.openingBalanceDate || today}
        max={today}
        hint="Usually today. Entries dated before this are treated as already included in these balances."
        error={err.openingDate}
      />
      <fieldset className="flex flex-col gap-3 rounded-2xl border p-4">
        <legend className="px-1 text-sm font-semibold">Default wallet</legend>
        <p className="text-sm text-muted-foreground">
          Preselected whenever you record something, so you never have to pick.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="cashName"
            label="Name"
            defaultValue={defaultWallet.name}
            maxLength={60}
            error={err.cashName}
          />
          <MoneyField
            name="cashBalance"
            label="Money in it now"
            defaultValue={paiseToInput(defaultWallet.openingBalancePaise || null)}
            hint="Blank = ₹0."
            error={err.cashBalance}
          />
        </div>
      </fieldset>

      {rows.map((row, index) => (
        <fieldset key={row.id} className="flex flex-col gap-3 rounded-2xl border p-4">
          <legend className="px-1 text-sm font-semibold">Wallet {index + 2}</legend>
          <input type="hidden" name={`extras.${index}.id`} value={row.id} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id={`extra-${row.id}-name`}
              name={`extras.${index}.name`}
              label="Name"
              placeholder="e.g. SBI savings, GPay"
              defaultValue={row.name}
              maxLength={60}
              error={err[`extras.${index}.name`]}
            />
            <SelectField
              id={`extra-${row.id}-kind`}
              name={`extras.${index}.kind`}
              label="Type"
              defaultValue={row.kind}
              error={err[`extras.${index}.kind`]}
            >
              {ACCOUNT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ACCOUNT_KIND_LABELS[kind]}
                </option>
              ))}
            </SelectField>
            <MoneyField
              id={`extra-${row.id}-balance`}
              name={`extras.${index}.balance`}
              label="Money in it now"
              defaultValue={row.balance}
              error={err[`extras.${index}.balance`]}
            />
          </div>
          {row.saved ? (
            <p className="text-xs text-muted-foreground">
              Saved already. Archive it on the Wallets page if you don’t use it.
            </p>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
            >
              <Trash2 aria-hidden="true" />
              Remove
            </Button>
          )}
        </fieldset>
      ))}
      {rows.length < MAX_EXTRA_ACCOUNTS && (
        <Button type="button" variant="outline" className="self-start" onClick={addRow}>
          <Plus aria-hidden="true" />
          Add a bank, UPI or other wallet
        </Button>
      )}
      <OpeningBalanceNote />
      <Actions pending={pending} label="Save & continue" footer={footer} />
    </ActionForm>
  );
}

export function BudgetsStepForm({
  next,
  footer,
  total,
  categories,
}: {
  next: string;
  footer?: React.ReactNode;
  total: number | null;
  categories: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    limitPaise: number | null;
  }[];
}) {
  const [state, formAction, pending] = React.useActionState(saveBudgetsStep, IDLE);
  const err = state.fieldErrors ?? {};
  return (
    <ActionForm action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <MoneyField
        name="total"
        label="Total spending per month"
        defaultValue={paiseToInput(total)}
        hint="Optional. Leave blank for no total budget."
        error={err.total}
      />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Per category (optional)</legend>
        <ul className="grid gap-3 sm:grid-cols-2">
          {categories.map((c, index) => (
            <li key={c.id} className="flex items-end gap-3">
              <CategoryBadge icon={c.icon} color={c.color} size="sm" className="mb-1.5" />
              <input type="hidden" name={`budget.${index}.categoryId`} value={c.id} />
              <MoneyField
                id={`budget-${c.id}`}
                name={`budget.${index}.amount`}
                label={c.name}
                defaultValue={paiseToInput(c.limitPaise)}
                error={err[`categories.${index}.amount`]}
                className="flex-1"
              />
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        Budgets are targets for the month, not money set aside. PocketPulse never blocks a purchase
        for going over; it just shows how you’re doing.
      </p>
      <Actions pending={pending} label="Save & continue" footer={footer} />
    </ActionForm>
  );
}

export function GoalStepForm({
  next,
  footer,
  goal,
  today,
}: {
  next: string;
  footer?: React.ReactNode;
  goal: { id: string; title: string; targetPaise: number | null; targetDate: string | null };
  today: string;
}) {
  const [state, formAction, pending] = React.useActionState(saveGoalStep, IDLE);
  const err = state.fieldErrors ?? {};
  return (
    <ActionForm action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="goalId" value={goal.id} />
      <FormMessage state={state} />
      <Field
        name="title"
        label="What are you saving for?"
        placeholder="e.g. New laptop, Goa trip"
        defaultValue={goal.title}
        maxLength={80}
        error={err.title}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="target"
          label="Target amount"
          defaultValue={paiseToInput(goal.targetPaise)}
          error={err.target}
        />
        <Field
          name="targetDate"
          label="By (optional)"
          type="date"
          min={today}
          defaultValue={goal.targetDate ?? ""}
          error={err.targetDate}
        />
      </div>
      <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        Setting money aside for a goal later only earmarks it — it isn’t spending and doesn’t reduce
        your tracked balance. It does lower what’s safe to spend.
      </p>
      <Actions pending={pending} label="Save & continue" footer={footer} />
    </ActionForm>
  );
}

export function PreferencesStepForm({
  footer,
  reminders,
  includeNotesInReports,
}: {
  footer?: React.ReactNode;
  reminders: ReminderPreferences;
  includeNotesInReports: boolean;
}) {
  const [state, formAction, pending] = React.useActionState(savePreferencesStep, IDLE);
  return (
    <ActionForm action={formAction} className="flex flex-col gap-6">
      <FormMessage state={state} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Reminders</legend>
        <RemindersFields prefs={reminders} />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Privacy</legend>
        <PrivacyFields includeNotesInReports={includeNotesInReports} />
      </fieldset>
      <Actions pending={pending} label="Finish setup" footer={footer} />
    </ActionForm>
  );
}
