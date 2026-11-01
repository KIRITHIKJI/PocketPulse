"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock,
  CloudOff,
  LoaderCircle,
  Pencil,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { Field, MoneyField } from "@/components/forms/form-parts";
import { useOffline } from "@/components/offline/offline-provider";
import { StatePanel } from "@/components/states/state-panel";
import { useLedger } from "@/components/transactions/use-ledger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type CurrencyCode, formatMoney, parseAmountInput } from "@/domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { formatDateTime, paiseToInput } from "@/lib/format";
import type { LedgerCommand, LedgerRecord } from "@/lib/ledger/commands";
import type { OpStatus, QueuedOp } from "@/lib/offline/ops";
import { replaceOp, retryOp } from "@/lib/offline/queue";
import {
  type Resolution,
  type ResolutionKey,
  resolutionCommands,
  resolutionsFor,
} from "@/lib/offline/resolve";

export const STATUS: Record<OpStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: "Waiting to sync", icon: Clock, className: "text-warning" },
  syncing: { label: "Syncing", icon: LoaderCircle, className: "text-primary" },
  synced: { label: "Synced", icon: CheckCircle2, className: "text-positive" },
  failed: { label: "Failed", icon: CircleAlert, className: "text-destructive" },
  conflict: { label: "Needs a decision", icon: AlertTriangle, className: "text-warning" },
};

export function opAmount(op: QueuedOp, fallback: CurrencyCode): string | null {
  if (op.amountPaise === null) return null;
  return formatMoney(op.amountPaise, {
    currency: (op.currency as CurrencyCode | null) ?? fallback,
  });
}

export function StatusBadge({ status }: { status: OpStatus }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <Badge variant="outline" className="gap-1" data-testid="sync-status" data-status={status}>
      <Icon
        className={`size-3 ${className} ${status === "syncing" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
}

const at = (ms: number, timeZone: string) => formatDateTime(new Date(ms).toISOString(), timeZone);

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

function CompareVersions({ op, timeZone }: { op: QueuedOp; timeZone: string }) {
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
function canEdit(op: QueuedOp) {
  return op.command.kind === "create" && (op.attempts === 0 || op.status === "failed");
}

function EditQueuedEntry({ op }: { op: QueuedOp }) {
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
    await replaceOp(op.opId, {
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

function ConfirmDiscard({ op, resolution }: { op: QueuedOp; resolution: Resolution }) {
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

function OpRow({
  op,
  currency,
  timeZone,
}: {
  op: QueuedOp;
  currency: CurrencyCode;
  timeZone: string;
}) {
  const { show } = useToast();
  const { syncNow } = useOffline();
  const amount = opAmount(op, currency);
  const open = op.status !== "synced" && op.status !== "syncing";

  async function resolve(key: ResolutionKey) {
    const choice = resolutionCommands(op, key);
    if (!choice) {
      show({ tone: "error", message: "That choice isn’t available for this entry." });
      return;
    }
    await replaceOp(op.opId, choice.command, { label: op.label }, choice.then);
    await syncNow();
  }

  async function retry() {
    await retryOp(op.opId);
    await syncNow();
  }

  return (
    <li>
      <Card className="gap-2 p-3" data-testid="sync-op" data-op-id={op.opId}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 basis-40">
            <p className="font-medium break-words">{op.label}</p>
            <p className="text-xs text-muted-foreground">
              {op.syncedAt
                ? `Synced ${at(op.syncedAt, timeZone)}`
                : `Recorded ${at(op.createdAt, timeZone)}`}
            </p>
          </div>
          {amount && <p className="tabular font-semibold">{amount}</p>}
          <StatusBadge status={op.status} />
        </div>
        {op.message && <p className="text-sm text-muted-foreground">{op.message}</p>}
        {op.status === "pending" && op.attempts > 0 && (
          <p className="text-sm text-muted-foreground">
            Couldn’t get through yet. It’ll keep trying, and it can’t be saved twice.
          </p>
        )}
        <CompareVersions op={op} timeZone={timeZone} />
        {open && (
          <div className="flex flex-wrap gap-2">
            {op.status === "failed" && (
              <Button size="sm" onClick={retry}>
                <RefreshCw aria-hidden="true" />
                Try again
              </Button>
            )}
            {canEdit(op) && <EditQueuedEntry op={op} />}
            {resolutionsFor(op).map((resolution) =>
              resolution.key === "discard" ? (
                <ConfirmDiscard key={resolution.key} op={op} resolution={resolution} />
              ) : (
                <Button
                  key={resolution.key}
                  size="sm"
                  onClick={() => resolve(resolution.key as ResolutionKey)}
                >
                  {resolution.label}
                </Button>
              ),
            )}
          </div>
        )}
      </Card>
    </li>
  );
}

function Section({
  title,
  ops,
  currency,
  timeZone,
}: {
  title: string;
  ops: QueuedOp[];
  currency: CurrencyCode;
  timeZone: string;
}) {
  if (ops.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {ops.map((op) => (
          <OpRow key={op.seq} op={op} currency={currency} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  );
}

/** Everything on this device that isn't on the server yet, and what just got there. */
export function SyncCenter({ currency, timeZone }: { currency: CurrencyCode; timeZone: string }) {
  const { ops, waiting, stuck, signedOut, syncing, syncNow, lastSyncedAt } = useOffline();
  const online = useOnlineStatus();
  if (ops === null) return null;
  const unstuck = waiting.filter((op) => !stuck.includes(op));
  const synced = ops.filter((op) => op.status === "synced").reverse();

  return (
    <div className="flex flex-col gap-6" data-testid="sync-center">
      {waiting.length === 0 ? (
        <StatePanel
          icon={CheckCircle2}
          title="Everything on this device is synced"
          description={
            lastSyncedAt
              ? `Last synced ${at(lastSyncedAt, timeZone)}.`
              : "Entries you save without a connection will appear here until they reach your account."
          }
        />
      ) : (
        <Card className="flex-row flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-56 text-sm" role="status">
            {signedOut
              ? "You’ve been signed out. Sign in again to sync these."
              : online
                ? `${waiting.length} not on your account yet.`
                : `${waiting.length} waiting. They’ll sync once you’re back online.`}
          </p>
          <Button onClick={() => void syncNow()} disabled={!online || syncing}>
            {online ? (
              <RefreshCw className={syncing ? "animate-spin" : undefined} aria-hidden="true" />
            ) : (
              <CloudOff aria-hidden="true" />
            )}
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </Card>
      )}
      <Section title="Needs your attention" ops={stuck} currency={currency} timeZone={timeZone} />
      <Section title="Waiting" ops={unstuck} currency={currency} timeZone={timeZone} />
      <Section title="Recently synced" ops={synced} currency={currency} timeZone={timeZone} />
    </div>
  );
}
