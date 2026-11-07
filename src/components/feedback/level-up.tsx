"use client";

import { Dialog as DialogPrimitive } from "radix-ui";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface LevelUp {
  from: number;
  to: number;
  rank: string;
  rankChanged: boolean;
  /** Where the new level stands, from the server's status. */
  levelXp: number;
  levelSpan: number;
  progressBp: number;
}

/**
 * The one peak moment of the ladder: a new level. The page dims, the status panel rises into
 * place (one 280 ms pass, nothing under reduced motion), and it waits for the person: Continue,
 * Escape or a tap outside closes it. Focus moves into it and comes back afterwards. It only ever
 * shows when nothing else is on screen (`lib/feedback-queue.ts`).
 */
export function LevelUpMoment({ levelUp, onDismiss }: { levelUp: LevelUp; onDismiss: () => void }) {
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onDismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="pp-dim-in fixed inset-0 z-[60] bg-black/60" />
        <DialogPrimitive.Content
          data-testid="level-up"
          className="fixed inset-x-4 top-1/2 z-[60] mx-auto flex max-w-sm -translate-y-1/2 flex-col outline-none"
        >
          <div className="pp-level-rise relative flex flex-col items-center gap-stack overflow-hidden rounded-3xl border border-primary/30 bg-(--surface-hero-bg) p-6 text-center shadow-(--surface-overlay-shadow) before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-(image:--gradient-status-edge)">
            <p className="type-caption tracking-wide text-muted-foreground uppercase">Level up</p>
            <DialogPrimitive.Title className="type-display text-progress-xp money">
              Level {levelUp.to}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="type-body text-muted-foreground">
              {levelUp.rankChanged ? (
                <>
                  New rank: <span className="font-semibold text-rank">{levelUp.rank}</span>. Your
                  logging habit got you here.
                </>
              ) : (
                <>
                  Still <span className="font-semibold text-rank">{levelUp.rank}</span>, one level
                  further. Your logging habit got you here.
                </>
              )}
            </DialogPrimitive.Description>
            <Progress
              className="w-full"
              bp={levelUp.progressBp}
              tone="xp"
              aria-label={`XP towards level ${levelUp.to + 1}`}
              valueText={`${levelUp.levelXp} of ${levelUp.levelSpan} XP`}
            />
            <p className="type-caption text-muted-foreground">
              <span className="money">{levelUp.levelSpan - levelUp.levelXp}</span> XP to level{" "}
              {levelUp.to + 1}
            </p>
            <DialogPrimitive.Close asChild>
              <Button className="mt-1 w-full" autoFocus>
                Continue
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
