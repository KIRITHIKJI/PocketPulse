import type { Metadata, Route } from "next";
import Link from "next/link";
import { Medal } from "lucide-react";

import { GreetAchievements } from "@/components/rewards/greet-achievements";
import { ProgressHeader, ProgressUnavailable } from "@/components/rewards/progress-page";
import { AchievementBadge } from "@/components/rewards/progress-parts";
import { StatePanel } from "@/components/states/state-panel";
import { requestNow } from "@/lib/data/session";
import { type AchievementState, dayOf, loadProgress } from "@/lib/rewards/view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Achievements" };

const FILTERS: { value: AchievementState | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unlocked", label: "Unlocked" },
  { value: "in_progress", label: "In progress" },
  { value: "locked", label: "Locked" },
];

/**
 * Achievements (doc/DESIGN_PLAN.md §4): unlocked first, then in progress, then locked, each with
 * its rule. Rare by design, and once unlocked they stay unlocked.
 */
export default async function AchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const [view, params] = await Promise.all([loadProgress(), searchParams]);
  const asked = typeof params.show === "string" ? params.show : "all";
  const filter = FILTERS.some((f) => f.value === asked) ? asked : "all";

  const unlockedCount = view?.achievements.filter((a) => a.state === "unlocked").length ?? 0;
  const total = view?.achievements.length ?? 0;
  const header = (
    <ProgressHeader
      title="Achievements"
      description={
        unlockedCount === 0
          ? `0 of ${total}. Each one shows how to earn it.`
          : `${unlockedCount} of ${total} unlocked. Once unlocked, an achievement stays.`
      }
      view={view}
    />
  );
  if (!view) {
    return (
      <>
        {header}
        <ProgressUnavailable />
      </>
    );
  }
  if (total === 0) {
    return (
      <>
        {header}
        <StatePanel
          icon={Medal}
          title="No achievements yet"
          description="Achievements appear here once they’re available. Your XP for each logged day still counts."
        />
      </>
    );
  }

  const shown = view.achievements.filter((a) => filter === "all" || a.state === filter);
  return (
    <>
      {header}
      <GreetAchievements
        now={requestNow()}
        unlocked={view.achievements.flatMap((a) =>
          a.unlockedAt ? [{ code: a.code, title: a.title, unlockedAt: a.unlockedAt }] : [],
        )}
      />
      <nav aria-label="Show achievements">
        <ul className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const count =
              f.value === "all"
                ? total
                : view.achievements.filter((a) => a.state === f.value).length;
            const active = f.value === filter;
            return (
              <li key={f.value}>
                <Link
                  href={
                    (f.value === "all"
                      ? "/rewards/achievements"
                      : `/rewards/achievements?show=${f.value}`) as Route
                  }
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 type-body text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11",
                    active && "border-primary/40 bg-primary-soft text-foreground",
                  )}
                >
                  {f.label}
                  <span className="type-caption money">{count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {shown.length === 0 ? (
        <StatePanel
          size="section"
          title={filter === "unlocked" ? "None unlocked yet" : "Nothing in this group"}
          description="Each achievement says what earns it. Show all to see them."
          actions={
            <Link
              href="/rewards/achievements"
              className="type-body font-medium text-primary underline-offset-4 hover:underline"
            >
              Show all
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
          {shown.map((a) => (
            <li key={a.code} className="min-w-0">
              <AchievementBadge
                achievement={a}
                dateLabel={a.unlockedAt ? dayOf(a.unlockedAt, view) : null}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
