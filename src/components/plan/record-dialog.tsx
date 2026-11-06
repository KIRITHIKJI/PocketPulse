"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
import { Field, MoneyField, SelectField } from "@/components/forms/form-parts";
import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney, instantFromLocalDateTime, isLocalDate, parseAmountInput } from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import { paiseToInput } from "@/lib/format";
import { newId } from "@/lib/ids";
import type { EntryDraft, LedgerCommand } from "@/lib/ledger/commands";

interface RecordDefaults {
  amountPaise: number | null;
  description: string;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
}

/**
 * Records one real entry for something planned: paying a bill, confirming a due item, buying what
 * a goal saved for. The ids are fixed for the life of the sheet, so a double tap or a retry sends
 * the same operation, and the database answers `duplicate` instead of saving a second entry.
 */
export function RecordDialog({
  trigger,
  title,
  description,
  kit,
  type,
  defaults,
  submitLabel,
  success,
  command,
  note,
  onSaved,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  kit: EntryKit;
  type: "expense" | "income";
  defaults: RecordDefaults;
  submitLabel: string;
  success: string;
  /** Wraps the entry in the command that also clears what was planned. */
  command: (draft: EntryDraft, ids: { opId: string; extraId: string }) => LedgerCommand;
  /** Shown above the button, from the amount being typed. */
  note?: (amountPaise: number | null) => React.ReactNode;
  onSaved?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [openCount, setOpenCount] = React.useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((n) => n + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">{description}</div>
          </DialogDescription>
        </DialogHeader>
        <RecordForm
          key={openCount}
          kit={kit}
          type={type}
          defaults={defaults}
          submitLabel={submitLabel}
          success={success}
          command={command}
          note={note}
          onDone={() => {
            setOpen(false);
            onSaved?.();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecordForm({
  kit,
  type,
  defaults,
  submitLabel,
  success,
  command,
  note,
  onDone,
}: {
  kit: EntryKit;
  type: "expense" | "income";
  defaults: RecordDefaults;
  submitLabel: string;
  success: string;
  command: (draft: EntryDraft, ids: { opId: string; extraId: string }) => LedgerCommand;
  note?: ((amountPaise: number | null) => React.ReactNode) | undefined;
  onDone: () => void;
}) {
  const { run } = useLedger();
  const [ids] = React.useState(() => ({ id: newId(), opId: newId(), extraId: newId() }));
  const firstSubmitAt = React.useRef<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const activeAccounts = kit.accounts.filter((a) => !a.archivedAt);
  const start =
    defaults.accountId && activeAccounts.some((a) => a.id === defaults.accountId)
      ? defaults.accountId
      : kit.defaultAccountId;
  const [accountId, setAccountId] = React.useState(start);
  const [amountText, setAmountText] = React.useState(paiseToInput(defaults.amountPaise));
  const [amountError, setAmountError] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(kit.today);
  const [dateError, setDateError] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState(
    defaults.categoryId
      ? { categoryId: defaults.categoryId, subcategoryId: defaults.subcategoryId }
      : null,
  );

  const parsed = parseAmountInput(amountText);
  const amountPaise = parsed.ok ? parsed.paise : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    if (!isLocalDate(date) || date > kit.today) {
      setDateError("Choose today or an earlier date.");
      return;
    }
    // Today means now; an earlier day has no real time, so it gets noon, as typed entries do.
    firstSubmitAt.current ??=
      date === kit.today
        ? new Date().toISOString()
        : new Date(instantFromLocalDateTime(date, "12:00", kit.timeZone)).toISOString();
    const draft: EntryDraft = {
      id: ids.id,
      type,
      amountPaise: parsed.paise,
      currency: kit.currency,
      occurredAt: firstSubmitAt.current,
      accountId,
      fromAccountId: null,
      toAccountId: null,
      refundOfId: null,
      categoryId: category?.categoryId ?? null,
      subcategoryId: category?.subcategoryId ?? null,
      description: defaults.description,
      merchant: null,
      note: null,
      tags: [],
      source: "manual",
      presetId: null,
    };
    setPending(true);
    const result = await run(command(draft, { opId: ids.opId, extraId: ids.extraId }), {
      success,
    });
    setPending(false);
    if (result?.ok) onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <MoneyField
        id={`record-amount-${ids.id}`}
        name="amount"
        label="Amount"
        value={amountText}
        onChange={(e) => {
          setAmountText(e.target.value);
          setAmountError(null);
        }}
        enterKeyHint="done"
        autoFocus
        error={amountError ?? undefined}
      />
      <Field
        id={`record-date-${ids.id}`}
        name="date"
        label="When it happened"
        type="date"
        max={kit.today}
        value={date}
        onChange={(e) => {
          setDate(e.target.value);
          setDateError(null);
        }}
        error={dateError ?? undefined}
      />
      <CategoryPicker
        id={`record-category-${ids.id}`}
        label="Category"
        tree={type === "income" ? kit.incomeTree : kit.expenseTree}
        value={category}
        placeholder="Unassigned"
        onChange={setCategory}
      />
      {activeAccounts.length > 1 && (
        <SelectField
          id={`record-account-${ids.id}`}
          name="accountId"
          label={type === "income" ? "Received in" : "Paid from"}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.isDefault ? " (default)" : ""}
            </option>
          ))}
        </SelectField>
      )}
      {note?.(amountPaise)}
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {pending
          ? "Saving…"
          : amountPaise !== null
            ? `${submitLabel} · ${formatMoney(amountPaise, { currency: kit.currency })}`
            : submitLabel}
      </Button>
    </form>
  );
}
