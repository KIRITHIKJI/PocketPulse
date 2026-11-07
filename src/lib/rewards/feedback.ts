/**
 * What a sync changed, in words the feedback chain can show (doc/DESIGN_PLAN.md §3, Toast):
 * a quiet XP line for routine awards, then a mission completed, an achievement, a new level.
 * Worked out on the server by comparing the stored state before and after a sync; the browser
 * only displays it, so it can never grant XP or decide that something was earned.
 */
import {
  type AchievementDefinition,
  OPT_OUT_PERIOD,
  type QuestDefinition,
  type RewardResult,
  levelFor,
  rankFor,
  totalXp,
} from "@/domain";

import type { RewardState } from "./engine";

export interface PlayerStatus {
  xp: number;
  level: number;
  rank: string;
  /** XP into this level, and how much the level holds. */
  levelXp: number;
  levelSpan: number;
  progressBp: number;
  /** Days in a row with something logged, counting today or yesterday as current. */
  streakDays: number;
  /** Server time it was read, so the newest of two copies wins. */
  asOf: number;
}

export function playerStatus(xp: number, streakDays: number, asOf: number): PlayerStatus {
  const level = levelFor(xp);
  return {
    xp,
    level: level.level,
    rank: rankFor(level.level),
    levelXp: xp - level.floorXp,
    levelSpan: level.nextLevelXp - level.floorXp,
    progressBp: level.progressBp,
    streakDays,
    asOf,
  };
}

export interface RewardFeedback {
  /** XP from routine awards (a logged day, a week with money set aside). Shown as a quiet line. */
  routineXp: number;
  routineReasons: string[];
  /** Missions that moved but aren't done, for a small progress note ("Steady habit · 7 of 20"). */
  progress: { code: string; title: string; progress: number; target: number }[];
  missionsCompleted: { code: string; title: string; xp: number }[];
  achievements: { code: string; title: string; description: string; xp: number }[];
  levelUp: { from: number; to: number; rank: string; rankChanged: boolean } | null;
  status: PlayerStatus;
}

const ROUTINE_REASONS: Record<string, string> = {
  logged_day: "Logged today",
  saved_week: "Set money aside this week",
  clean_week: "A fully sorted week",
  budget_month: "A month within your budget",
  weekly_review: "Weekly review",
};

/** True when the feedback has anything to show at all. */
export function hasFeedback(f: RewardFeedback): boolean {
  return (
    f.routineXp > 0 ||
    f.progress.length > 0 ||
    f.missionsCompleted.length > 0 ||
    f.achievements.length > 0 ||
    f.levelUp !== null
  );
}

/**
 * The difference between two stored states. Comparing states (not one sync's own writes) means
 * it's right however many passes or syncs ran in between: an award earned and then revoked again
 * shows nothing, and an award restored after an Undo shows once.
 */
export function rewardFeedback(
  before: RewardState,
  after: RewardState,
  result: RewardResult,
  catalog: { achievements: readonly AchievementDefinition[]; quests: readonly QuestDefinition[] },
  streakDays: number,
  asOf: number,
): RewardFeedback {
  const liveBefore = new Set(before.events.filter((e) => !e.revokedAt).map((e) => e.sourceKey));
  const gained = after.events.filter((e) => !e.revokedAt && !liveBefore.has(e.sourceKey));
  const routine = gained.filter((e) => e.kind in ROUTINE_REASONS);

  const quests = new Map(catalog.quests.map((q) => [q.code, q]));
  const questKey = (code: string, period: string) => `${code}:${period}`;
  const doneBefore = new Set(
    before.quests.filter((q) => q.completedAt).map((q) => questKey(q.questCode, q.periodKey)),
  );
  const progressBefore = new Map(
    before.quests.map((q) => [questKey(q.questCode, q.periodKey), q.progress]),
  );
  const missionsCompleted = after.quests
    .filter(
      (q) =>
        q.completedAt &&
        q.periodKey !== OPT_OUT_PERIOD &&
        !doneBefore.has(questKey(q.questCode, q.periodKey)) &&
        quests.has(q.questCode),
    )
    .map((q) => {
      const quest = quests.get(q.questCode)!;
      return { code: quest.code, title: quest.title, xp: quest.xp };
    });
  const progress = result.quests
    .filter(
      (q) =>
        !q.complete &&
        q.target > 1 &&
        q.progress > (progressBefore.get(questKey(q.code, q.periodKey)) ?? 0),
    )
    .map((q) => ({
      code: q.code,
      title: quests.get(q.code)?.title ?? q.code,
      progress: q.progress,
      target: q.target,
    }));

  const unlockedBefore = new Set(before.achievements.map((a) => a.code));
  const achievements = catalog.achievements
    .filter((a) => after.achievements.some((u) => u.code === a.code) && !unlockedBefore.has(a.code))
    .map(({ code, title, description, xp }) => ({ code, title, description, xp }));

  const xpBefore = totalXp(before.events);
  const xpAfter = totalXp(after.events);
  const from = levelFor(xpBefore).level;
  const to = levelFor(xpAfter).level;
  return {
    routineXp: routine.reduce((sum, e) => sum + e.xp, 0),
    routineReasons: [...new Set(routine.map((e) => ROUTINE_REASONS[e.kind]!))],
    progress,
    missionsCompleted,
    achievements,
    levelUp:
      to > from
        ? { from, to, rank: rankFor(to), rankChanged: rankFor(to) !== rankFor(from) }
        : null,
    status: playerStatus(xpAfter, streakDays, asOf),
  };
}
