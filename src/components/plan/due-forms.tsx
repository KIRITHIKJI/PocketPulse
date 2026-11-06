"use client";

import * as React from "react";
import { CalendarClock, Repeat } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { useDialogAction } from "@/components/forms/use-dialog-action";
import { PlanNote } from "@/components/plan/parts";
import { RecordDialog } from "@/components/plan/record-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveBill } from "@/lib/actions/recurring";
import type { EntryKit } from "@/lib/data/entry-kit";
import { formatLocalDate } from "@/lib/format";
import { newId } from "@/lib/ids";
import type { DueItem } from "@/lib/plan-view";
import { WalletField } from "@/components/plan/wallet-field";

export function BillFormDialog({ kit }: { kit: EntryKit }) {
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(saveBill);
  const [id, setId] = React.useState(newId);
  const err = state.fieldErrors ?? {};
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setId(newId());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock aria-hidden="true" />
          Add a bill
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an upcoming bill</DialogTitle>
          <DialogDescription>
            Money you’ve promised but haven’t paid. It comes off safe-to-spend until you pay it, and
            it isn’t spending until then.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={id} />
          <FormMessage state={state} />
          <Field
            id="bill-title"
            name="title"
            label="What’s it for?"
            maxLength={120}
            autoComplete="off"
            required
            error={err.title}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField id="bill-amount" name="amount" label="Amount" required error={err.amount} />
            <Field
              id="bill-due"
              name="dueDate"
              label="Due on"
              type="date"
              defaultValue={kit.today}
              required
              error={err.dueDate}
            />
          </div>
          <CategoryPicker
            id="bill-category"
            label="Category (optional)"
            tree={kit.expenseTree}
            placeholder="Choose when you pay it"
            error={err.categoryId ?? err.subcategoryId}
          />
          <WalletField id="bill-account" kit={kit} value={null} />
          <Field id="bill-note" name="note" label="Note (optional)" maxLength={500} />
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            Add bill
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Marks a planned item as having really happened: one entry, and the plan clears in that save. */
export function RecordDueButton({ item, kit }: { item: DueItem; kit: EntryKit }) {
  const income = item.kind === "income";
  const label = item.source === "bill" ? "Mark paid" : income ? "Record it" : "Mark paid";
  return (
    <RecordDialog
      trigger={
        <Button size="sm" aria-label={`${label}: ${item.title}, ${formatLocalDate(item.dueDate)}`}>
          <Repeat aria-hidden="true" />
          {label}
        </Button>
      }
      title={item.title}
      description={
        <p>
          Due {formatLocalDate(item.dueDate)}. This records what actually happened as a real entry,
          and takes it off your upcoming list in the same save.
        </p>
      }
      kit={kit}
      type={item.kind}
      defaults={{
        amountPaise: item.amountPaise,
        description: item.title,
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        accountId: item.accountId,
      }}
      submitLabel={income ? "Record" : "Record payment"}
      success={`Recorded ${item.title}.`}
      command={(draft, ids) =>
        item.commitmentId
          ? {
              kind: "pay_commitment",
              opId: ids.opId,
              commitmentId: item.commitmentId,
              draft,
            }
          : {
              kind: "confirm_recurring",
              opId: ids.opId,
              templateId: item.templateId!,
              occurrence: item.occurrence!,
              draft,
            }
      }
      note={() =>
        income ? null : (
          <PlanNote>
            Its entry is the only thing that lowers your balance from here. It won’t be subtracted
            again as a bill.
          </PlanNote>
        )
      }
    />
  );
}
