"use client";

import * as React from "react";
import { CalendarClock, Pencil, Plus, Repeat } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
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
import { saveBill, saveRecurring } from "@/lib/actions/recurring";
import type { EntryKit } from "@/lib/data/entry-kit";
import { formatLocalDate, paiseToInput } from "@/lib/format";
import { newId } from "@/lib/ids";
import type { DueItem } from "@/lib/plan-view";

function WalletField({ id, kit, value }: { id: string; kit: EntryKit; value: string | null }) {
  return (
    <SelectField
      id={id}
      name="accountId"
      label="Wallet"
      defaultValue={value ?? kit.defaultAccountId}
    >
      {kit.accounts
        .filter((a) => !a.archivedAt)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.isDefault ? " (default)" : ""}
          </option>
        ))}
    </SelectField>
  );
}

/** A planned one-off bill. Nothing is spent until it's paid. */
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

export interface EditableRecurring {
  id: string;
  kind: "income" | "expense";
  title: string;
  amountPaise: number | null;
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  intervalCount: number;
  nextDueDate: string;
  endDate: string | null;
  mode: "confirm" | "remind";
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
}

const CADENCE_LABELS = { daily: "Days", weekly: "Weeks", monthly: "Months", yearly: "Years" };

/** A recurring income or expense: a schedule that forecasts, never an entry by itself. */
export function RecurringFormDialog({
  template,
  kit,
  trigger,
}: {
  /** Set to edit, or to start from a suggestion (id null-like: a new id is used). */
  template?: Partial<EditableRecurring> & { title: string };
  kit: EntryKit;
  trigger?: React.ReactNode;
}) {
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(saveRecurring);
  const editing = Boolean(template?.id);
  const [newTemplateId, setNewTemplateId] = React.useState(newId);
  const [kind, setKind] = React.useState(template?.kind ?? "expense");
  const err = state.fieldErrors ?? {};
  const prefix = template?.id ? `recurring-${template.id}` : "recurring-new";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setNewTemplateId(newId());
          setKind(template?.kind ?? "expense");
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (editing ? (
            <Button variant="ghost" size="sm" aria-label={`Edit ${template!.title}`}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          ) : (
            <Button>
              <Plus aria-hidden="true" />
              Add recurring
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${template!.title}` : "Add a recurring item"}</DialogTitle>
          <DialogDescription>
            This only forecasts. Nothing is booked as income or spending until you confirm it
            happened.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="id" value={template?.id ?? newTemplateId} />
          <FormMessage state={state} />
          <SelectField
            id={`${prefix}-kind`}
            name="kind"
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as "income" | "expense")}
            error={err.kind}
          >
            <option value="expense">Expense (rent, a subscription)</option>
            <option value="income">Income (allowance, stipend)</option>
          </SelectField>
          <Field
            id={`${prefix}-title`}
            name="title"
            label="Name"
            defaultValue={template?.title ?? ""}
            maxLength={80}
            autoComplete="off"
            required
            error={err.title}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField
              id={`${prefix}-amount`}
              name="amount"
              label="Amount"
              defaultValue={paiseToInput(template?.amountPaise ?? null)}
              required
              error={err.amount}
            />
            <Field
              id={`${prefix}-due`}
              name="nextDueDate"
              label="Next due"
              type="date"
              defaultValue={template?.nextDueDate ?? kit.today}
              required
              error={err.nextDueDate}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${prefix}-interval`}
              name="intervalCount"
              label="Repeats every"
              inputMode="numeric"
              defaultValue={String(template?.intervalCount ?? 1)}
              error={err.intervalCount}
            />
            <SelectField
              id={`${prefix}-cadence`}
              name="cadence"
              label="Unit"
              defaultValue={template?.cadence ?? "monthly"}
              error={err.cadence}
            >
              {Object.entries(CADENCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            id={`${prefix}-mode`}
            name="mode"
            label="When it’s due"
            defaultValue={template?.mode ?? "confirm"}
            error={err.mode}
          >
            <option value="confirm">Ask me to record it</option>
            <option value="remind">Just remind me</option>
          </SelectField>
          <CategoryPicker
            key={kind}
            id={`${prefix}-category`}
            label="Category (optional)"
            tree={kind === "income" ? kit.incomeTree : kit.expenseTree}
            defaultCategoryId={template?.categoryId ?? null}
            defaultSubcategoryId={template?.subcategoryId ?? null}
            placeholder="Choose when you record it"
            error={err.categoryId ?? err.subcategoryId}
          />
          <WalletField id={`${prefix}-account`} kit={kit} value={template?.accountId ?? null} />
          <Field
            id={`${prefix}-end`}
            name="endDate"
            label="Ends on (optional)"
            type="date"
            defaultValue={template?.endDate ?? ""}
            error={err.endDate}
          />
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {editing ? "Save changes" : "Add recurring item"}
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
