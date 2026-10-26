"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Info, RotateCcw } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { useToast } from "@/components/feedback/toast";
import { useLedger } from "@/components/transactions/use-ledger";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  type CategoryChoice,
  instantFromLocalDateTime,
  isBeforeOpeningDate,
  isLocalDate,
  isLocalTime,
  suggestCategory,
} from "@/domain";
import { type EntryFormState, saveEntryForm } from "@/lib/actions/transactions";
import type { EntryKit } from "@/lib/data/entry-kit";
import { formatLocalDate, paiseToInput } from "@/lib/format";
import { IDLE } from "@/lib/forms";
import { newId } from "@/lib/ids";
import type { EntryType } from "@/lib/ledger/commands";
import { beforeOpeningText } from "@/lib/opening-note";
import { ENTRY_TYPE_LABELS } from "@/lib/validation/transactions";

export type EntryInitial = {
  id: string;
  version: number | null;
  type: EntryType;
  amountPaise: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  refundOfId: string | null;
  date: string;
  time: string;
  description: string;
  merchant: string;
  note: string;
  tags: string;
};

export type RefundableExpense = { id: string; label: string };

const TYPE_OPTIONS = [
  { value: "expense", label: "Expense", icon: ArrowUpRight },
  { value: "income", label: "Income", icon: ArrowDownLeft },
  { value: "refund", label: "Refund", icon: RotateCcw },
  { value: "transfer", label: "Transfer", icon: ArrowLeftRight },
] as const;

/**
 * Full entry form. Only the amount and (for spending/income) the category are needed; the
 * default wallet, today and the current time are prefilled. Edits quote the row version.
 */
export function TransactionForm({
  kit,
  mode,
  initial,
  opId: initialOpId,
  refundable,
}: {
  kit: EntryKit;
  mode: "create" | "edit";
  initial: EntryInitial;
  /** Generated on the server for the first render, so hydration matches. */
  opId: string;
  refundable: RefundableExpense[];
}) {
  const router = useRouter();
  const { show, setHighlightId } = useToast();
  const { undo } = useLedger();
  const [ids, setIds] = React.useState({ id: initial.id, opId: initialOpId });
  const [formKey, setFormKey] = React.useState(0);
  const [state, formAction, pending] = React.useActionState<EntryFormState, FormData>(
    async (previous, formData) => {
      const next = await saveEntryForm(previous, formData);
      if (next.status !== "success" || !next.result?.ok) return next;
      const { status, undo: reverse } = next.result;
      const action = reverse ? { label: "Undo", run: () => undo(reverse) } : undefined;
      if (mode === "create") {
        setHighlightId(String(formData.get("id")));
        show({
          tone: "success",
          message:
            status === "duplicate"
              ? "Already saved — no duplicate was added."
              : "Saved. Add another?",
          action,
        });
        // Fresh ids for the next entry; the saved one can only be replayed, never duplicated.
        setIds({ id: newId(), opId: newId() });
        setFormKey((k) => k + 1);
      } else {
        show({
          tone: "success",
          message: status === "duplicate" ? "Nothing changed." : "Changes saved.",
          action,
        });
        router.push(`/transactions/${initial.id}`);
      }
      return next;
    },
    IDLE,
  );

  return (
    <ActionForm action={formAction} className="flex flex-col gap-5" aria-label="Transaction">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="id" value={ids.id} />
      <input type="hidden" name="opId" value={ids.opId} />
      <input type="hidden" name="version" value={initial.version ?? ""} />
      {state.status === "error" && <FormMessage state={state} />}
      <EntryFields
        key={formKey}
        kit={kit}
        mode={mode}
        initial={mode === "create" && formKey > 0 ? { ...initial, amountPaise: null } : initial}
        refundable={refundable}
        errors={state.status === "error" ? (state.fieldErrors ?? {}) : {}}
      />
      <SubmitButton pending={pending} pendingLabel="Saving…">
        {mode === "edit" ? "Save changes" : "Save entry"}
      </SubmitButton>
    </ActionForm>
  );
}

function EntryFields({
  kit,
  mode,
  initial,
  refundable,
  errors,
}: {
  kit: EntryKit;
  mode: "create" | "edit";
  initial: EntryInitial;
  refundable: RefundableExpense[];
  errors: Partial<Record<string, string>>;
}) {
  const [type, setType] = React.useState<EntryType>(initial.type);
  const [chosen, setChosen] = React.useState<CategoryChoice | null>(
    initial.categoryId
      ? { categoryId: initial.categoryId, subcategoryId: initial.subcategoryId }
      : null,
  );
  const [pickedByUser, setPickedByUser] = React.useState(initial.categoryId !== null);
  const [description, setDescription] = React.useState(initial.description);
  const [merchant, setMerchant] = React.useState(initial.merchant);
  const [date, setDate] = React.useState(initial.date);
  const [time, setTime] = React.useState(initial.time);
  const [accountId, setAccountId] = React.useState(initial.accountId ?? kit.defaultAccountId);
  const [fromAccountId, setFromAccountId] = React.useState(
    initial.fromAccountId ?? kit.defaultAccountId,
  );
  const [toAccountId, setToAccountId] = React.useState(initial.toAccountId ?? "");

  // Wallets offered: active ones, plus whichever this entry already uses (even if archived).
  const inUse = new Set([initial.accountId, initial.fromAccountId, initial.toAccountId]);
  const wallets = kit.accounts.filter((a) => !a.archivedAt || inUse.has(a.id));
  const walletOptions = wallets.map((a) => (
    <option key={a.id} value={a.id}>
      {a.name}
      {a.isDefault ? " (default)" : ""}
      {a.archivedAt ? " (archived)" : ""}
    </option>
  ));

  const kind = type === "income" ? "income" : "expense";
  const deferredDescription = React.useDeferredValue(description);
  const deferredMerchant = React.useDeferredValue(merchant);
  const suggestion = React.useMemo(
    () =>
      type === "transfer" || type === "refund"
        ? null
        : suggestCategory(
            { description: deferredDescription, merchant: deferredMerchant, kind },
            { categories: kit.categories, rules: kit.rules, history: kit.history },
          ),
    [type, kind, deferredDescription, deferredMerchant, kit],
  );
  const category = pickedByUser ? chosen : (suggestion ?? chosen);

  // The domain's opening-date rule, for whichever wallets this entry touches.
  const instant =
    isLocalDate(date) && isLocalTime(time)
      ? instantFromLocalDateTime(date, time, kit.timeZone)
      : null;
  const touched = type === "transfer" ? [fromAccountId, toAccountId] : [accountId];
  const beforeOpening =
    instant === null
      ? []
      : kit.accounts.filter(
          (a) => touched.includes(a.id) && isBeforeOpeningDate(a, instant, kit.timeZone),
        );

  return (
    <>
      {mode === "create" ? (
        <div className="flex flex-col gap-1.5">
          <span id="entry-type-label" className="text-sm font-medium">
            Type
          </span>
          <SegmentedControl
            aria-label="Type"
            value={type}
            onValueChange={(next) => {
              setType(next);
              setChosen(null);
              setPickedByUser(false);
            }}
            options={TYPE_OPTIONS}
            className="w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Type: <span className="font-medium text-foreground">{ENTRY_TYPE_LABELS[type]}</span>
          <span className="block text-xs">
            To change the type, delete this entry and add a new one.
          </span>
        </p>
      )}
      <input type="hidden" name="type" value={type} />

      <MoneyField
        id="entry-amount"
        name="amount"
        label="Amount"
        defaultValue={paiseToInput(initial.amountPaise)}
        autoFocus={mode === "create"}
        className="[&_input]:h-14 [&_input]:text-2xl [&_input]:font-semibold"
        error={errors.amount}
      />

      {type !== "transfer" && (
        <CategoryPicker
          key={type}
          id="entry-category"
          label={type === "refund" ? "Category (optional)" : "Category"}
          tree={type === "income" ? kit.incomeTree : kit.expenseTree}
          value={category}
          placeholder={type === "refund" ? "Same as the original expense" : "Choose a category"}
          error={errors.categoryId ?? errors.subcategoryId}
          hint={
            !pickedByUser && suggestion
              ? `Suggested: ${suggestion.reason}. Change it if it’s wrong.`
              : type === "refund"
                ? "A refund reduces spending in the original expense’s category unless you pick another."
                : undefined
          }
          onChange={(choice) => {
            setChosen(choice);
            setPickedByUser(true);
          }}
        />
      )}

      {type === "refund" &&
        (refundable.length > 0 || initial.refundOfId ? (
          <SelectField
            id="entry-refund-of"
            name="refundOfId"
            label="Refund of"
            defaultValue={initial.refundOfId ?? ""}
            disabled={mode === "edit"}
            hint={
              mode === "edit"
                ? "The original expense can’t change. Delete this refund and add a new one instead."
                : "Refunds add money back without counting as income."
            }
            error={errors.refundOfId}
          >
            <option value="">Choose the expense</option>
            {refundable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </SelectField>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            There’s no expense to refund yet. A refund must be linked to the purchase it returns
            money for.
          </p>
        ))}
      {mode === "edit" && initial.refundOfId && (
        <input type="hidden" name="refundOfId" value={initial.refundOfId} />
      )}

      {type === "transfer" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="entry-from"
            name="fromAccountId"
            label="From wallet"
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            error={errors.fromAccountId}
          >
            {walletOptions}
          </SelectField>
          <SelectField
            id="entry-to"
            name="toAccountId"
            label="To wallet"
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            hint="Moving money between your own wallets doesn’t change your total."
            error={errors.toAccountId}
          >
            <option value="">Choose a wallet</option>
            {walletOptions}
          </SelectField>
        </div>
      ) : (
        <SelectField
          id="entry-account"
          name="accountId"
          label={type === "expense" ? "Paid from" : "Wallet"}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          error={errors.accountId}
        >
          {walletOptions}
        </SelectField>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field
          id="entry-date"
          name="date"
          label="Date"
          type="date"
          value={date}
          max={kit.today}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
        />
        <Field
          id="entry-time"
          name="time"
          label="Time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          hint={kit.timeZone === "Asia/Kolkata" ? "IST" : kit.timeZone}
          error={errors.time}
        />
      </div>
      {beforeOpening.map((a) => (
        <p key={a.id} className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs" role="note">
          <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
          {beforeOpeningText(a.name, formatLocalDate(a.openingBalanceDate))}
        </p>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="entry-description"
          name="description"
          label="Description"
          placeholder="e.g. masala chai"
          value={description}
          maxLength={200}
          autoComplete="off"
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
        />
        <Field
          id="entry-merchant"
          name="merchant"
          label="Merchant or person"
          placeholder="e.g. canteen"
          value={merchant}
          maxLength={120}
          autoComplete="off"
          onChange={(e) => setMerchant(e.target.value)}
          error={errors.merchant}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <label htmlFor="entry-note" className="text-sm font-medium">
          Note
        </label>
        <textarea
          id="entry-note"
          name="note"
          defaultValue={initial.note}
          maxLength={1000}
          rows={2}
          aria-invalid={errors.note ? true : undefined}
          className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm"
        />
        {errors.note && <p className="text-sm text-destructive">{errors.note}</p>}
      </div>
      <Field
        id="entry-tags"
        name="tags"
        label="Tags"
        placeholder="e.g. project, trip"
        defaultValue={initial.tags}
        autoComplete="off"
        hint="Separate tags with commas."
        error={errors.tags}
      />
    </>
  );
}
