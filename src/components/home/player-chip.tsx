import Link from "next/link";
import { ChevronRight, CalendarCheck } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlayerStatus } from "@/lib/rewards/status";

/**
 * Home's compact progress: rank, level, XP to the next level and the streak. It opens Player
 * status. Streamed after the money figures, and never larger than them.
 */
export async function PlayerChip() {
  let status;
  try {
    status = await getPlayerStatus();
  } catch {
    // Progress is secondary: a failed read leaves a quiet link instead of breaking Home.
    return (
      <Surface variant="interactive" asChild>
        <Link href="/rewards" data-testid="player-chip" data-state="error">
          <span className="type-body text-muted-foreground">
            Your progress couldn’t load. Open Player status.
          </span>
        </Link>
      </Surface>
    );
  }

  const fresh = status.xp === 0;
  return (
    <Surface variant="interactive" asChild className="gap-3">
      <Link
        href="/rewards"
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
          <span className="ml-auto money">{status.xp} XP</span>
        </span>
      </Link>
    </Surface>
  );
}

export function PlayerChipSkeleton() {
  return (
    <Surface aria-busy="true" className="gap-3" data-testid="player-chip-loading">
      <span className="sr-only">Loading your progress…</span>
      <div className="flex items-center gap-3" aria-hidden="true">
        <Skeleton className="size-10 rounded-xl" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </Surface>
  );
}
