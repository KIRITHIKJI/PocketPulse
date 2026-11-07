"use client";

import Link from "next/link";
import { CalendarCheck, ChevronRight } from "lucide-react";

import { useLiveStatus } from "@/components/feedback/reward-feedback";
import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import type { PlayerStatus } from "@/lib/rewards/feedback";

/**
 * The chip's face. It starts from the server's stored status and follows the newer one a save
 * brings back, so XP, level and streak move right after logging without reloading Home.
 */
export function PlayerChipView({ initial }: { initial: PlayerStatus }) {
  const status = useLiveStatus(initial);
  const fresh = status.xp === 0;
  return (
    <Surface variant="interactive" asChild className="gap-3">
      <Link
        href="/rewards/status"
        data-testid="player-chip"
        aria-label={`Player status: level ${status.level}, ${status.rank}, ${status.xp} XP, ${status.streakDays}-day streak`}
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-progress-xp/40 bg-primary-soft type-body font-semibold text-progress-xp">
            {status.level}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-body font-semibold">
              Level {status.level} · <span className="text-rank">{status.rank}</span>
            </span>
            <span className="type-caption text-muted-foreground">
              {fresh
                ? "Log your first expense to start earning XP"
                : `${status.levelSpan - status.levelXp} XP to level ${status.level + 1}`}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <Progress
          bp={status.progressBp}
          tone="xp"
          aria-label="XP towards the next level"
          valueText={`${status.levelXp} of ${status.levelSpan} XP`}
        />
        <span className="flex items-center gap-1.5 type-caption text-muted-foreground">
          <CalendarCheck className="size-3.5" aria-hidden="true" />
          {status.streakDays > 0
            ? `${status.streakDays}-day logging streak`
            : "No streak yet. Any day you log starts one."}
          <span className="ml-auto money" data-testid="player-chip-xp">
            {status.xp} XP
          </span>
        </span>
      </Link>
    </Surface>
  );
}
