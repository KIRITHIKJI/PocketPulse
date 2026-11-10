import Link from "next/link";

import { PlayerChipView } from "@/components/home/player-chip-view";
import { Surface } from "@/components/ui/surface";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlayerStatus } from "@/lib/rewards/status";

/**
 * Home's compact progress: rank, level, XP to the next level and the streak. It opens Player
 * status (`/rewards/status`). Streamed after the money figures, and never larger than them.
 */
export async function PlayerChip() {
  let status;
  try {
    status = await getPlayerStatus();
  } catch {
    // Progress is secondary: a failed read leaves a quiet link instead of breaking Home.
    return (
      <Surface variant="interactive" asChild>
        <Link href="/rewards/status" data-testid="player-chip" data-state="error">
          <span className="type-body text-muted-foreground">
            Your progress couldn’t load. Open Player status.
          </span>
        </Link>
      </Surface>
    );
  }

  return <PlayerChipView initial={status} />;
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

/** The sidebar's compact chip. Streamed after the page; a failed read just leaves it out. */
export async function SidebarPlayerChip() {
  const status = await getPlayerStatus().catch(() => null);
  return status ? <PlayerChipView initial={status} compact /> : null;
}

export function SidebarPlayerChipSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-14 flex-col justify-center gap-1.5 rounded-xl border px-3"
    >
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}
