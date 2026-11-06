"use client";

import * as React from "react";
import { LoaderCircle, Minus, Plus } from "lucide-react";

import { Field, MoneyField } from "@/components/forms/form-parts";
import { PlanNote } from "@/components/plan/parts";
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
import { moneyFormatter, parseAmountInput } from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import { newId } from "@/lib/ids";

function MoveForm({
  goalId,
  moveType,
  limitPaise,
  flexiblePaise,
  money,
  title,
  onDone,
}: {
  goalId: string;
  moveType: "allocation" | "allocation_release";
  limitPaise: number | null;
  flexiblePaise: number | null;
  money: (paise: number) => string;
  title: string;
  onDone: () => void;
}) {
  const { run } = useLedger();
  // Fixed for this sheet: a double tap or retry replays the same move.
  const [ids] = React.useState(() => ({ id: newId(), opId: newId() }));
  const at = React.useRef<string | null>(null);
  const [amountText, setAmountText] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const setAside = moveType === "allocation";
  const parsed = parseAmountInput(amountText);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    if (limitPaise !== null && parsed.paise > limitPaise) {
      setError(`Only ${money(limitPaise)} is set aside for this goal.`);
      return;
    }
    at.current ??= new Date().toISOString();
    setPending(true);
    const result = await run(
      {
        kind: "goal_move",
        opId: ids.opId,
        id: ids.id,
        goalId,
        moveType,
        amountPaise: parsed.paise,
        occurredAt: at.current,
        note: note.trim() || null,
      },
      {
        success: setAside
          ? `Set aside ${money(parsed.paise)} for ${title}`
          : `Released ${money(parsed.paise)} from ${title}`,
      },
    );
    setPending(false);
    if (result?.ok) onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <MoneyField
        id={`move-amount-${ids.id}`}
        name="amount"
        label="Amount"
        value={amountText}
        onChange={(e) => {
          setAmountText(e.target.value);
          setError(null);
        }}
        enterKeyHint="done"
        autoFocus
        error={error ?? undefined}
        hint={limitPaise !== null ? `${money(limitPaise)} is set aside.` : undefined}
      />
      <Field
        id={`move-note-${ids.id}`}
        name="note"
        label="Note (optional)"
        value={note}
        maxLength={200}
        autoComplete="off"
        onChange={(e) => setNote(e.target.value)}
      />
      {setAside && flexiblePaise !== null && (
        <PlanNote>
          Your tracked balance doesn’t change. Flexible money goes from {money(flexiblePaise)}
          {parsed.ok ? ` to ${money(flexiblePaise - parsed.paise)}` : " down by this amount"}.
        </PlanNote>
      )}
      {!setAside && (
        <PlanNote>This isn’t income. The money just goes back to being flexible.</PlanNote>
      )}
      <Button type="submit" size="lg" disabled={pending} aria-disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {pending ? "Saving…" : setAside ? "Set aside" : "Release"}
      </Button>
    </form>
  );
}

/** Set money aside for the goal, or release it. An earmark only: never income or an expense. */
export function GoalMoveDialog({
  goalId,
  title,
  moveType,
  savedPaise,
  flexiblePaise,
  currency,
  variant = "default",
}: {
  goalId: string;
  title: string;
  moveType: "allocation" | "allocation_release";
  savedPaise: number;
  flexiblePaise: number | null;
  currency: EntryKit["currency"];
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [openCount, setOpenCount] = React.useState(0);
  const money = moneyFormatter(currency);
  const setAside = moveType === "allocation";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpenCount((n) => n + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          {setAside ? <Plus aria-hidden="true" /> : <Minus aria-hidden="true" />}
          {setAside ? "Set money aside" : "Release money"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{setAside ? `Set aside for ${title}` : `Release from ${title}`}</DialogTitle>
          <DialogDescription>
            {setAside
              ? "This earmarks money you already track. It isn’t a purchase."
              : "This takes money out of the goal without spending it."}
          </DialogDescription>
        </DialogHeader>
        <MoveForm
          key={openCount}
          goalId={goalId}
          moveType={moveType}
          limitPaise={setAside ? null : savedPaise}
          flexiblePaise={flexiblePaise}
          money={money}
          title={title}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
