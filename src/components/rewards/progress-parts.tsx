import Link from "next/link";
import type { Route } from "next";
import {
  CalendarCheck,
  CircleCheck,
  Flame,
  ListChecks,
  Lock,
  PiggyBank,
  ScanSearch,
  SearchCheck,
  Target,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { InlineAction } from "@/components/forms/inline-action";
import { ReviewWeekButton } from "@/components/rewards/review-week-button";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import { formatDayLabel } from "@/lib/format";
import { changeQuest } from "@/lib/actions/rewards";
import type { PlayerStatus } from "@/lib/rewards/feedback";
import type { AchievementView, MissionView, ProgressView } from "@/lib/rewards/view";
import { cn } from "@/lib/utils";

/**
 * The player overview: level, rank and XP to the next level. A `status` surface (violet edge),
 * never wrapping or sitting above a money figure. Real stored XP only.
 */
export function StatusPanel({
  status,
  children,
  action,
}: {
  status: PlayerStatus;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const fresh = status.xp === 0;
  return (
    <Surface variant="status" aria-labelledby="player-level" role="region" className="gap-4">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex size-16 shrink-0 items-center justify-center rounded-2xl border border-progress-xp/40 bg-primary-soft type-title text-progress-xp money"
        >
          {status.level}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="type-caption text-muted-foreground">Rank</p>
          <h2 id="player-level" className="type-title" data-testid="reward-level">
            Level {status.level} · <span className="text-rank">{status.rank}</span>
          </h2>
          <p className="type-caption text-muted-foreground" data-testid="reward-xp">
            <span className="money">{status.xp}</span> XP in total
          </p>
        </div>
        {action}
      </div>
      <Progress
        bp={status.progressBp}
        tone="xp"
        label={`Level ${status.level + 1}`}
        valueText={`${status.levelXp} of ${status.levelSpan} XP`}
        aria-label="XP towards the next level"
      />
      <p className="type-body text-muted-foreground">
        {fresh ? (
          "Your first logged day earns 10 XP."
        ) : (
          <>
            <span className="money">{status.levelSpan - status.levelXp}</span> XP to level{" "}
            {status.level + 1}
          </>
        )}
      </p>
      {children}
    </Surface>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The last seven days, logged or not: the North Star as a plain count. Days without an entry
 * are simply empty, never red, and nothing here says "lost" or "broken".
 */
export function WeekStrip({ week, today }: Pick<ProgressView, "week" | "today">) {
  const count = week.filter((d) => d.logged).length;
  return (
    <div className="flex flex-col gap-2" data-testid="week-strip">
      <p className="type-body">
        Logged <span className="font-semibold money">{count}</span> of the last 7 days
      </p>
      <ol className="grid grid-cols-7 gap-1.5">
        {week.map((d) => {
          const label = formatDayLabel(d.date, today);
          return (
            <li key={d.date} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border",
                  d.logged
                    ? "border-progress-xp/40 bg-primary-soft text-progress-xp"
                    : "border-border bg-surface-inset text-muted-foreground",
                )}
              >
                {d.logged ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
                <span className="sr-only">
                  {label}: {d.logged ? "logged" : "nothing logged"}
                </span>
              </span>
              <span aria-hidden="true" className="type-caption text-muted-foreground">
                {d.date === today ? "Today" : WEEKDAYS[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Where each mission is done. Every mission is a step of the job: log, look, sort, set aside. */
const MISSION_LINKS: Record<string, { href: Route; label: string }> = {
  log_today: { href: "/add", label: "Quick add" },
  review_today: { href: "/insights?period=today" as Route, label: "Look at today" },
  categorise_week: { href: "/categories?tab=uncategorized" as Route, label: "Open the queue" },
  set_aside_week: { href: "/goals", label: "Open goals" },
  set_a_goal: { href: "/goals", label: "Add a goal" },
  steady_logging: { href: "/add", label: "Quick add" },
  saving_habit: { href: "/goals", label: "Open goals" },
};

const RESETS = { daily: "Today", weekly: "This week", once: "Long-term" } as const;

/** A mission: status mark, what to do, progress, its XP and when it resets, plus Skip. */
export function MissionRow({ mission }: { mission: MissionView }) {
  const link = MISSION_LINKS[mission.code];
  const multi = mission.target > 1;
  if (mission.skipped) {
    return (
      <li
        className="flex min-h-14 items-center gap-3 py-3"
        data-testid="mission"
        data-state="skipped"
      >
        <span className="min-w-0 flex-1 type-body text-muted-foreground">
          {mission.title} · Skipped
        </span>
        <InlineAction
          action={changeQuest}
          fields={{ code: mission.code, optOut: "false" }}
          pendingLabel="Saving…"
          variant="outline"
          aria-label={`Bring back the ${mission.title} mission`}
        >
          Bring back
        </InlineAction>
      </li>
    );
  }
  return (
    <li
      className="flex flex-col gap-2 py-3"
      data-testid="mission"
      data-code={mission.code}
      data-state={mission.complete ? "done" : "open"}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border",
            mission.complete
              ? "border-feedback-success/40 bg-feedback-success/15 text-feedback-success"
              : "border-border-strong",
          )}
        >
          {mission.complete ? <CircleCheck className="size-4" /> : null}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3
            className={cn("type-body font-semibold", mission.complete && "text-muted-foreground")}
          >
            {mission.title}
            <span className="sr-only">{mission.complete ? ", done" : ", open"}</span>
          </h3>
          <p className="type-caption text-muted-foreground">{mission.description}</p>
        </div>
        <span className="shrink-0 type-caption text-progress-xp money">+{mission.xp} XP</span>
      </div>
      {multi && (
        <Progress
          className="pl-9"
          steps={mission.target}
          value={mission.progress}
          tone={mission.complete ? "money" : "xp"}
          aria-label={`${mission.title} progress`}
        />
      )}
      <div className="flex flex-wrap items-center gap-1 pl-9">
        <span className="mr-auto type-caption text-muted-foreground">
          {mission.complete ? "Completed" : RESETS[mission.cadence]}
          {multi && !mission.complete ? ` · ${mission.progress} of ${mission.target}` : ""}
        </span>
        {mission.complete && mission.toSort > 0 && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={MISSION_LINKS.categorise_week!.href} data-testid="mission-to-sort">
              <span className="money">{mission.toSort}</span> new{" "}
              {mission.toSort === 1 ? "entry" : "entries"} to sort
            </Link>
          </Button>
        )}
        {!mission.complete && mission.code === "weekly_review" && <ReviewWeekButton />}
        {!mission.complete && link && (
          <Button size="sm" variant="ghost" asChild>
            <Link href={link.href}>{link.label}</Link>
          </Button>
        )}
        {!mission.complete && (
          <InlineAction
            action={changeQuest}
            fields={{ code: mission.code, optOut: "true" }}
            pendingLabel="Saving…"
            aria-label={`Skip the ${mission.title} mission`}
          >
            Skip
          </InlineAction>
        )}
      </div>
    </li>
  );
}

const GLYPHS: Record<string, LucideIcon> = {
  "list-checks": ListChecks,
  flame: Flame,
  "search-check": SearchCheck,
  "piggy-bank": PiggyBank,
  target: Target,
  "scan-search": ScanSearch,
  "calendar-check": CalendarCheck,
};

/** An achievement: line glyph, name, rule, then progress or the day it was unlocked. */
export function AchievementBadge({
  achievement,
  dateLabel,
}: {
  achievement: AchievementView;
  dateLabel: string | null;
}) {
  const unlocked = achievement.state === "unlocked";
  const Glyph = unlocked ? (GLYPHS[achievement.icon ?? ""] ?? Trophy) : Lock;
  return (
    <Surface
      className="h-full flex-row items-start gap-3"
      data-testid="achievement"
      data-earned={unlocked}
      data-state={achievement.state}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          unlocked
            ? "bg-surface-inset text-rank ring-2 ring-rank/60"
            : "bg-surface-inset text-muted-foreground",
        )}
      >
        <Glyph className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="type-body font-semibold">{achievement.title}</h3>
        <p className="type-caption text-muted-foreground">{achievement.description}</p>
        {unlocked ? (
          <p className="type-caption text-rank">
            Unlocked{dateLabel ? ` · ${dateLabel}` : ""} ·{" "}
            <span className="money">+{achievement.xp} XP</span>
          </p>
        ) : (
          <>
            {achievement.target > 1 && (
              <Progress
                steps={achievement.target}
                value={achievement.progress}
                tone="neutral"
                aria-label={`${achievement.title} progress`}
              />
            )}
            <p className="type-caption text-muted-foreground">
              {achievement.target > 1
                ? `${achievement.progress} of ${achievement.target} · `
                : "Not yet · "}
              <span className="money">{achievement.xp} XP</span>
            </p>
          </>
        )}
      </div>
    </Surface>
  );
}
