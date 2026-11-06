"use client";

import * as React from "react";
import { Pencil } from "lucide-react";

import { Field, MoneyField } from "@/components/forms/form-parts";
import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, parseAmountInput } from "@/domain";
import { formatDateTime, paiseToInput } from "@/lib/format";
import type { LedgerCommand, LedgerRecord } from "@/lib/ledger/commands";
import type { QueuedOp } from "@/lib/offline/ops";
import { loadQueue } from "@/lib/offline/load-queue";
import { type Resolution } from "@/lib/offline/resolve";

export const at = (ms: number, timeZone: string) =>
  formatDateTime(new Date(ms).toISOString(), timeZone);

type Compared = { amount: string; description: string; when: string };

function describeRecord(record: LedgerRecord, timeZone: string): Compared {
  return {
    amount: formatMoney(record.amountPaise, { currency: record.currency }),
    description: record.description ?? "No description",
    when: formatDateTime(record.occurredAt, timeZone),
  };
}

function describeMine(
  command: Extract<LedgerCommand, { kind: "update" }>,
  latest: LedgerRecord,
  timeZone: string,
): Compared {
  return describeRecord(
    {
      ...latest,
      amountPaise: command.patch.amountPaise ?? latest.amountPaise,
      description:
        command.patch.description === undefined ? latest.description : command.patch.description,
      occurredAt: command.patch.occurredAt ?? latest.occurredAt,
    } as LedgerRecord,
    timeZone,
  );
}

export function CompareVersions({ op, timeZone }: { op: QueuedOp; timeZone: string }) {
  const latest = op.serverRecord;
  if (!latest || op.command.kind !== "update") return null;
  const columns = [
    { title: "Your change", value: describeMine(op.command, latest, timeZone) },
    {
      title: latest.deletedAt ? "Latest (deleted elsewhere)" : "Latest version",
      value: describeRecord(latest, timeZone),
    },
  ];
  return (
    <dl className="grid gap-2 sm:grid-cols-2" data-testid="conflict-versions">
      {columns.map(({ title, value }) => (
        <div key={title} className="rounded-lg border p-2.5 text-sm">
          <dt className="text-xs font-medium text-muted-foreground">{title}</dt>
          <dd className="tabular font-semibold">{value.amount}</dd>
          <dd className="break-words">{value.description}</dd>
          <dd className="text-xs text-muted-foreground">{value.when}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Editing is only safe while the server has certainly not got this version of the entry. */
export function canEdit(op: QueuedOp) {
  return op.command.kind === "create" && (op.attempts === 0 || op.status === "failed");
}

export function EditQueuedEntry({ op }: { op: QueuedOp }) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(paiseToInput(op.amountPaise));
  const [description, setDescription] = React.useState(op.label);
  const [error, setError] = React.useState<string | null>(null);
  if (op.command.kind !== "create") return null;
  const { command } = op;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseAmountInput(amount);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    const text = description.trim() || null;
    await (
      await loadQueue()
    ).replaceOp(op.opId, {
      ...command,
      draft: { ...command.draft, amountPaise: parsed.paise, description: text },
    });
    setOpen(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil aria-hidden="true" />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={save} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit before it syncs</DialogTitle>
              <DialogDescription>
                This entry is still on this device, so the change replaces it.
              </DialogDescription>
            </DialogHeader>
            <MoneyField
              id={`queued-amount-${op.opId}`}
              name="amount"
              label="Amount"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              error={error ?? undefined}
            />
            <Field
              id={`queued-description-${op.opId}`}
              name="description"
              label="Description"
              value={description}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ConfirmDiscard({ op, resolution }: { op: QueuedOp; resolution: Resolution }) {
  const [open, setOpen] = React.useState(false);
  const { cancelQueued } = useLedger();
  async function confirm() {
    setOpen(false);
    await cancelQueued(op.command);
  }
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {resolution.label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resolution.label}?</DialogTitle>
            <DialogDescription>
              “{op.label}” will be removed from this device for good. This can’t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Go back
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={confirm}>
              Remove it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
