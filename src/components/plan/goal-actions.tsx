"use client";

import * as React from "react";
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  LoaderCircle,
  Minus,
  PartyPopper,
  Pause,
  Play,
  Plus,
  ShoppingBag,
  X,
} from "lucide-react";

import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { Field, FormMessage, MoneyField } from "@/components/forms/form-parts";
import { PlanNote } from "@/components/plan/parts";
import { RecordDialog } from "@/components/plan/record-dialog";
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
import { type GoalStatus, formatMoney, parseAmountInput, releaseFromSaved } from "@/domain";
import { setGoalStatus } from "@/lib/actions/goals";
import type { EntryKit } from "@/lib/data/entry-kit";
import { IDLE, type FormState } from "@/lib/forms";
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
  const money = (paise: number) => formatMoney(paise, { currency });
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

/** "I bought the thing": the real expense and the release, saved together or not at all. */
export function GoalPurchaseDialog({
  goalId,
  title,
  savedPaise,
  targetPaise,
  kit,
}: {
  goalId: string;
  title: string;
  savedPaise: number;
  targetPaise: number;
  kit: EntryKit;
}) {
  const money = (paise: number) => formatMoney(paise, { currency: kit.currency });
  return (
    <RecordDialog
      trigger={
        <Button variant="outline">
          <ShoppingBag aria-hidden="true" />I bought it
        </Button>
      }
      title={`You bought ${title}?`}
      description={
        <p>
          Record what you actually paid. We’ll release the money set aside, so it isn’t counted
          twice.
        </p>
      }
      kit={kit}
      type="expense"
      defaults={{
        amountPaise: savedPaise > 0 ? savedPaise : targetPaise,
        description: title,
        categoryId: null,
        subcategoryId: null,
        accountId: null,
      }}
      submitLabel="Record purchase"
      success={`Recorded your purchase of ${title}.`}
      command={(draft, ids) => ({
        kind: "goal_purchase",
        opId: ids.opId,
        goalId,
        releaseId: ids.extraId,
        draft,
      })}
      note={(amountPaise) => {
        if (amountPaise === null) return null;
        const released = releaseFromSaved(amountPaise, savedPaise);
        return (
          <div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm">
            <p>
              <span className="font-medium">{money(amountPaise)}</span> goes on record as spending,
              and your tracked balance drops by that much.
            </p>
            <p data-testid="purchase-release">
              {released > 0 ? (
                <>
                  <span className="font-medium">{money(released)}</span> is released from this goal,
                  so that money stops being set aside
                  {released < savedPaise
                    ? ` (${money(savedPaise - released)} stays in the goal)`
                    : ""}
                  .
                </>
              ) : (
                "Nothing is set aside for this goal, so nothing is released."
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Together they mean the money is subtracted once, not twice.
            </p>
          </div>
        );
      }}
    />
  );
}

const CONFETTI = ["#8b5cf6", "#a3e635", "#f472b6", "#38bdf8", "#facc15", "#c4b5fd"];

/** A short burst around a message that stays. It covers nothing and blocks nothing. */
export function GoalCelebration({
  title,
  savedLabel,
  onDismiss,
}: {
  title: string;
  savedLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      data-testid="goal-celebration"
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-positive/40 bg-positive-soft p-4"
    >
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * 2 * Math.PI;
        const style = {
          "--pp-x": `${Math.round(Math.cos(angle) * 170)}px`,
          "--pp-y": `${Math.round(Math.sin(angle) * 56)}px`,
          backgroundColor: CONFETTI[i % CONFETTI.length],
          animationDelay: `${(i % 4) * 40}ms`,
        } as React.CSSProperties;
        return <span key={i} aria-hidden="true" className="pp-celebrate-piece" style={style} />;
      })}
      <span className="pp-celebrate-pop flex size-11 shrink-0 items-center justify-center rounded-full bg-positive text-background">
        <PartyPopper className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">You did it: {title} is complete</p>
        <p className="text-sm text-muted-foreground">{savedLabel}</p>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Status changes for one goal. Holds the celebration, which outlives the button that starts it. */
export function GoalStatusActions({
  goalId,
  title,
  status,
  reachedTarget,
  savedPaise,
  currency,
}: {
  goalId: string;
  title: string;
  status: GoalStatus;
  reachedTarget: boolean;
  savedPaise: number;
  currency: EntryKit["currency"];
}) {
  const money = (paise: number) => formatMoney(paise, { currency });
  const [celebrating, setCelebrating] = React.useState(false);
  const [state, setState] = React.useState<FormState>(IDLE);
  const [pending, startTransition] = React.useTransition();
  const idle = { id: goalId };

  function complete() {
    const formData = new FormData();
    formData.set("id", goalId);
    formData.set("action", "complete");
    startTransition(async () => {
      try {
        const result = await setGoalStatus(IDLE, formData);
        setState(result);
        if (result.status === "success") setCelebrating(true);
      } catch {
        setState({ status: "error", message: "Couldn’t reach PocketPulse. Try again." });
      }
    });
  }

  return (
    <>
      {celebrating && (
        <GoalCelebration
          title={title}
          savedLabel={
            savedPaise > 0
              ? `${money(savedPaise)} is still set aside. Release it, or record the purchase, when you use it.`
              : "Every step of it stays in this goal’s history."
          }
          onDismiss={() => setCelebrating(false)}
        />
      )}
      {state.status === "error" && <FormMessage state={state} />}
      <div className="flex flex-wrap items-center gap-1" data-testid="goal-status-actions">
        {status === "active" && (
          <Button
            variant={reachedTarget ? "default" : "ghost"}
            size="sm"
            onClick={complete}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <CircleCheck aria-hidden="true" />
            )}
            Mark complete
          </Button>
        )}
        {status === "active" && (
          <InlineAction
            action={setGoalStatus}
            fields={{ ...idle, action: "pause" }}
            pendingLabel="Pausing…"
          >
            <Pause aria-hidden="true" />
            Pause
          </InlineAction>
        )}
        {status === "paused" && (
          <InlineAction
            action={setGoalStatus}
            fields={{ ...idle, action: "resume" }}
            pendingLabel="Resuming…"
          >
            <Play aria-hidden="true" />
            Resume
          </InlineAction>
        )}
        {(status === "completed" || status === "archived") && (
          <InlineAction
            action={setGoalStatus}
            fields={{ ...idle, action: "reopen" }}
            pendingLabel="Reopening…"
          >
            <ArchiveRestore aria-hidden="true" />
            {status === "archived" ? "Restore" : "Reopen"}
          </InlineAction>
        )}
        {status !== "archived" && (
          <ConfirmAction
            action={setGoalStatus}
            fields={{ ...idle, action: "archive" }}
            trigger={
              <Button variant="ghost" size="sm">
                <Archive aria-hidden="true" />
                Archive
              </Button>
            }
            title={`Archive ${title}?`}
            description={
              <>
                <p>It moves out of your active goals. Nothing is deleted.</p>
                <p>
                  {savedPaise > 0
                    ? `The ${money(savedPaise)} set aside stays set aside, so it still comes off safe-to-spend, until you release it.`
                    : "Its history stays, and you can restore it any time."}
                </p>
              </>
            }
            confirmLabel="Archive"
            pendingLabel="Archiving…"
          />
        )}
      </div>
    </>
  );
}
