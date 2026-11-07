import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, History, Medal } from "lucide-react";

import { GreetAchievements } from "@/components/rewards/greet-achievements";
import { ProgressHeader, ProgressUnavailable } from "@/components/rewards/progress-page";
import {
  AchievementBadge,
  MissionRow,
  StatusPanel,
  WeekStrip,
} from "@/components/rewards/progress-parts";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { parseInstant } from "@/domain";
import { requestNow } from "@/lib/data/session";
import { type HistoryRow, type ProgressView, dayOf, loadProgress } from "@/lib/rewards/view";

export const metadata: Metadata = { title: "Rewards" };

const ACTIVE_MISSIONS = 4;

function HistoryList({ rows, view }: { rows: HistoryRow[]; view: ProgressView }) {
  if (rows.length === 0) {
    return (
      <StatePanel
        size="section"
        icon={History}
        title="No XP yet"
        description="Each award shows here: what earned it, and when."
      />
    );
  }
  return (
    <ul className="flex flex-col divide-y" data-testid="xp-history">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 py-2">
          <span className="min-w-0 flex-1 type-body">{row.label}</span>
          <span className="shrink-0 type-caption text-muted-foreground">{dayOf(row.at, view)}</span>
          <span className="w-14 shrink-0 text-right type-caption text-progress-xp money">
            +{row.xp} XP
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Rewards, the progression hub (doc/DESIGN_PLAN.md §4): the player overview, this week's logged
 * days, active missions, the newest achievements, then the XP history.
 */
export default async function RewardsPage() {
  const view = await loadProgress();
  const header = (
    <ProgressHeader
      title="Rewards"
      description="XP and missions for logging and reviewing your money, never for spending less."
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

  // Today's and this week's missions first, open before done; at most four.
  const active = view.missions
    .filter((m) => !m.skipped && m.cadence !== "once")
    .sort((a, b) => Number(a.complete) - Number(b.complete))
    .slice(0, ACTIVE_MISSIONS);
  const unlocked = view.achievements
    .filter((a) => a.unlockedAt)
    .sort((a, b) => parseInstant(b.unlockedAt!) - parseInstant(a.unlockedAt!));
  const newest = unlocked.slice(0, 3);
  // The closest one to unlock, so "none yet" still says what to do next.
  const closest = view.achievements
    .filter((a) => a.state !== "unlocked")
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0];

  return (
    <>
      {header}
      <GreetAchievements
        now={requestNow()}
        unlocked={unlocked.map((a) => ({
          code: a.code,
          title: a.title,
          unlockedAt: a.unlockedAt!,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="lg:col-span-7">
          <StatusPanel
            status={view.status}
            action={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/rewards/status">
                  See status
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            }
          />
        </div>
        <Surface className="lg:col-span-5">
          <SurfaceHeader
            title="This week"
            meta={
              view.status.streakDays > 0
                ? `${view.status.streakDays}-day logging streak`
                : "Any day you log starts a streak"
            }
          />
          <WeekStrip week={view.week} today={view.today} />
        </Surface>
      </div>

      <Surface>
        <SurfaceHeader
          title="Today and this week"
          meta="Optional. Skipping costs nothing."
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/rewards/missions">
                All missions
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        />
        {active.length === 0 ? (
          <StatePanel
            size="section"
            title="No missions on right now"
            description="You skipped them all, and that’s fine. Bring any back from All missions."
          />
        ) : (
          <ul className="-my-3 grid divide-y md:grid-cols-2 md:gap-x-6 md:divide-y-0">
            {active.map((m) => (
              <MissionRow key={m.code} mission={m} />
            ))}
          </ul>
        )}
      </Surface>

      <section aria-labelledby="newest-achievements" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="newest-achievements" className="type-heading">
            Achievements · <span className="money">{unlocked.length}</span> of{" "}
            {view.achievements.length}
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/rewards/achievements">
              All achievements
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {newest.length === 0 ? (
          <Surface>
            <StatePanel
              size="section"
              icon={Medal}
              title="None yet"
              description={
                closest
                  ? `Closest: ${closest.title}. ${closest.description}`
                  : "Achievements unlock from your own logging."
              }
            />
          </Surface>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
            {newest.map((a) => (
              <li key={a.code} className="min-w-0">
                <AchievementBadge achievement={a} dateLabel={dayOf(a.unlockedAt!, view)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Surface>
        <div className="hidden flex-col gap-stack lg:flex">
          <SurfaceHeader title="XP history" meta="The 20 newest awards." />
          <HistoryList rows={view.history} view={view} />
        </div>
        <details className="group lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 type-heading">
            XP history
            <span className="type-body font-normal text-primary group-open:hidden">
              Show history
            </span>
            <span className="hidden type-body font-normal text-primary group-open:inline">
              Hide
            </span>
          </summary>
          <div className="pt-2">
            <HistoryList rows={view.history} view={view} />
          </div>
        </details>
      </Surface>

      <p className="type-caption text-muted-foreground">
        XP comes from logging, categorising, reviewing and setting money aside, never from spending
        less. Undoing or deleting an entry takes back that day’s XP and mission progress.
        Achievements are different: each is unique, so once unlocked it stays, with its XP. A streak
        is only a count, and your longest stays.
      </p>
    </>
  );
}
