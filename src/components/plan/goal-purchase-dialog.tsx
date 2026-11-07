"use client";

import * as React from "react";
import { ShoppingBag } from "lucide-react";

import { RecordDialog } from "@/components/plan/record-dialog";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
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
          <Surface variant="inset" className="gap-1 type-body">
            <p>
              <span className="font-medium money">{money(amountPaise)}</span> goes on record as
              spending, and your tracked balance drops by that much.
            </p>
            <p data-testid="purchase-release">
              {released > 0 ? (
                <>
                  <span className="font-medium text-money-earmark money">{money(released)}</span> is
                  released from this goal, so that money stops being set aside
                  {released < savedPaise ? (
                    <>
                      {" "}
                      (<span className="money">{money(savedPaise - released)}</span> stays in the
                      goal)
                    </>
                  ) : null}
                  .
                </>
              ) : (
                "Nothing is set aside for this goal, so nothing is released."
              )}
            </p>
            <p className="type-caption text-muted-foreground">
              Together they mean the money is subtracted once, not twice.
            </p>
          </Surface>
        );
      }}
    />
  );
}
