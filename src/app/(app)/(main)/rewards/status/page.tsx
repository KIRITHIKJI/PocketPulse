import type { Metadata } from "next";
import Link from "next/link";
import { Award, CalendarCheck, Sparkles, TrendingUp, Zap } from "lucide-react";

import { ProgressHeader, ProgressUnavailable } from "@/components/rewards/progress-page";
import { StatusPanel } from "@/components/rewards/progress-parts";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { dayOf, loadProgress } from "@/lib/rewards/view";

export const metadata: Metadata = { title: "Player status" };

/**
 * Player status (doc/DESIGN_PLAN.md §4): level and rank, XP to the next level, streaks, lifetime
 * XP, then the milestones so far. A calm place to look back; nothing here is about money.
 */
export default async function PlayerStatusPage() {
  const view = await loadProgress();
  const header = (
    <ProgressHeader
      title="Player status"
      description="Your logging habit over time. XP comes from logging, sorting and reviewing, never from spending less."
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
  const { status } = view;
  const stats = [
    {
      label: "Current streak",
      value: status.streakDays,
      unit: status.streakDays === 1 ? "day" : "days",
      icon: CalendarCheck,
      testId: "streak-daily",
    },
    {
      label: "Longest streak",
      value: view.longestStreak,
      unit: view.longestStreak === 1 ? "day" : "days",
      icon: TrendingUp,
      testId: "streak-longest",
    },
    { label: "Lifetime XP", value: status.xp, unit: "XP", icon: Sparkles, testId: "lifetime-xp" },
  ];

  return (
    <>
      {header}
      <StatusPanel status={status}>
        {status.xp === 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-inset p-3">
            <p className="min-w-0 flex-1 type-body">Log your first expense to start.</p>
            <Button size="sm" asChild>
              <Link href="/add">
                <Zap aria-hidden="true" />
                Quick add
              </Link>
            </Button>
          </div>
        )}
      </StatusPanel>

      <dl className="grid gap-3 sm:grid-cols-3 lg:gap-6">
        {stats.map(({ label, value, unit, icon: Icon, testId }) => (
          <Surface key={label} className="gap-1">
            <dt className="flex items-center gap-1.5 type-caption text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </dt>
            <dd className="type-title money" data-testid={testId}>
              {value} <span className="type-body text-muted-foreground">{unit}</span>
            </dd>
          </Surface>
        ))}
      </dl>
      <p className="-mt-2 type-caption text-muted-foreground">
        A streak is only a count. A day off is fine, and your longest stays.
      </p>

      <Surface>
        <SurfaceHeader title="Milestones" />
        {view.milestones.length === 0 ? (
          <StatePanel
            size="section"
            icon={Award}
            title="No milestones yet"
            description="Levels you reach and achievements you unlock are listed here, with the day."
          />
        ) : (
          <ol className="flex flex-col" data-testid="milestones">
            {view.milestones.map((m, i) => (
              <li key={`${m.kind}:${m.title}:${i}`} className="flex gap-3 py-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-progress-xp data-[kind=achievement]:bg-rank"
                  data-kind={m.kind}
                />
                <span className="min-w-0 flex-1 type-body">{m.title}</span>
                <span className="shrink-0 type-caption text-muted-foreground">
                  {dayOf(m.at, view)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Surface>
    </>
  );
}
