"use client";

import * as React from "react";
import { LoaderCircle, Undo2 } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import { type CurrencyCode, KEPT_FLEXIBLE_TAG, formatMoney } from "@/domain";
import { newId } from "@/lib/ids";
import type { GoalReleaseNote } from "@/lib/plan-view";

/**
 * A purchase from a goal was deleted on its own, so the money released for it is flexible now and
 * not back in the goal. Setting it aside again removes that release, which puts back exactly that
 * amount. Either answer clears the note, and both go through the mutation layer with Undo.
 */
function ReleaseNote({ note, currency }: { note: GoalReleaseNote; currency: CurrencyCode }) {
  const { run } = useLedger();
  const [opId] = React.useState(newId);
  const [pending, setPending] = React.useState<"restore" | "keep" | null>(null);
  const amount = formatMoney(note.amountPaise, { currency });

  async function setAsideAgain() {
    setPending("restore");
    await run(
      { kind: "delete", opId, id: note.releaseId },
      { success: `Set ${amount} aside again for ${note.goalTitle}.` },
    );
    setPending(null);
  }

  async function keepFlexible() {
    setPending("keep");
    await run(
      {
        kind: "update",
        opId,
        id: note.releaseId,
        expectedVersion: note.version,
        patch: { tags: [...note.tags, KEPT_FLEXIBLE_TAG] },
      },
      { success: `${amount} stays flexible.` },
    );
    setPending(null);
  }

  return (
    <div data-testid="goal-release-note">
      <Notice
        tone="info"
        action={
          <div className="flex flex-wrap gap-1 pl-3">
            <Button size="sm" onClick={setAsideAgain} disabled={pending !== null}>
              {pending === "restore" ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Undo2 aria-hidden="true" />
              )}
              Set {amount} aside again
            </Button>
            <Button variant="ghost" size="sm" onClick={keepFlexible} disabled={pending !== null}>
              Keep it flexible
            </Button>
          </div>
        }
      >
        You deleted a purchase made with savings for {note.goalTitle}. The{" "}
        <span className="text-money-earmark money">{amount}</span> wasn’t put back into the goal.
      </Notice>
    </div>
  );
}

export function GoalReleaseNotes({
  notes,
  currency,
}: {
  notes: GoalReleaseNote[];
  currency: CurrencyCode;
}) {
  if (notes.length === 0) return null;
  return (
    <section aria-label="Money released for deleted purchases" className="flex flex-col gap-2">
      {notes.map((note) => (
        <ReleaseNote key={note.releaseId} note={note} currency={currency} />
      ))}
    </section>
  );
}
