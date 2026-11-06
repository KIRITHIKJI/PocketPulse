"use client";

import * as React from "react";
import { ShoppingBag } from "lucide-react";

import { RecordDialog } from "@/components/plan/record-dialog";
import { Button } from "@/components/ui/button";
import { moneyFormatter, releaseFromSaved } from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";

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
  const money = moneyFormatter(kit.currency);
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
