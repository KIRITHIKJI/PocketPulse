"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { OpeningBalanceNote } from "@/components/accounts/account-form";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
} from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { ACCOUNT_KINDS } from "@/domain";
import { saveBalancesStep } from "@/lib/actions/onboarding";
import { IDLE } from "@/lib/forms";
import { paiseToInput } from "@/lib/format";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";
import { MAX_EXTRA_ACCOUNTS } from "@/lib/validation/onboarding";
import { Actions } from "@/components/onboarding/step-forms";

type ExtraRow = { id: string; name: string; kind: string; balance: string; saved: boolean };

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
