"use client";

import { Info, Pencil, Plus } from "lucide-react";

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
import { ACCOUNT_KINDS } from "@/domain";
import { createAccount, updateAccount } from "@/lib/actions/accounts";
import { paiseToInput } from "@/lib/format";
import { ACCOUNT_KIND_LABELS } from "@/lib/validation/accounts";

export type EditableAccount = {
  id: string;
  name: string;
  kind: (typeof ACCOUNT_KINDS)[number];
  openingBalancePaise: number;
  openingBalanceDate: string;
};

/** The note shown wherever an opening balance is set. */
export function OpeningBalanceNote() {
  return (
    <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>
        The opening balance is what you count in this wallet at the start of the opening date.
        PocketPulse adds and subtracts your entries from there — it isn’t connected to a bank and
        doesn’t verify balances. Entries dated <em>before</em> the opening date are treated as
        already included, so they don’t change the balance.
      </span>
    </p>
  );
}

/** Create or edit a wallet: name, type, opening balance and its effective date. */
export function AccountFormDialog({
  account,
  today,
}: {
  account?: EditableAccount;
  today: string;
}) {
  const editing = Boolean(account);
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(
    editing ? updateAccount : createAccount,
  );
  const err = state.fieldErrors ?? {};
  const prefix = account ? `account-${account.id}` : "account-new";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${account!.name}`}>
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" />
            Add wallet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${account!.name}` : "Add a wallet"}</DialogTitle>
          <DialogDescription>
            Cash, a bank account, a UPI app or anything else you keep money in.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          {account && <input type="hidden" name="id" value={account.id} />}
          <FormMessage state={state} />
          <Field
            id={`${prefix}-name`}
            name="name"
            label="Name"
            defaultValue={account?.name ?? ""}
            maxLength={60}
            autoComplete="off"
            required
            error={err.name}
          />
          <SelectField
            id={`${prefix}-kind`}
            name="kind"
            label="Type"
            defaultValue={account?.kind ?? "bank"}
            error={err.kind}
          >
            {ACCOUNT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ACCOUNT_KIND_LABELS[kind]}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              id={`${prefix}-opening`}
              name="openingBalance"
              label="Opening balance"
              defaultValue={paiseToInput(account?.openingBalancePaise ?? null)}
              hint="Blank = ₹0. Use a minus sign if it’s overdrawn."
              error={err.openingBalance}
            />
            <Field
              id={`${prefix}-date`}
              name="openingDate"
              label="Opening date"
              type="date"
              defaultValue={account?.openingBalanceDate ?? today}
              required
              error={err.openingDate}
            />
          </div>
          <OpeningBalanceNote />
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {editing ? "Save changes" : "Add wallet"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
