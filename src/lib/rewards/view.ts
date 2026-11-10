import "server-only";

import { cache } from "react";

import {
  type AchievementDefinition,
  type LocalDate,
  type QuestDefinition,
  addDays,
  levelFor,
  parseInstant,
  toLocalDate,
  totalXp,
} from "@/domain";
import { getProfile } from "@/lib/data/queries";
import { requestNow, requestToday } from "@/lib/data/session";
import { formatDayLabel } from "@/lib/format";
import { type RewardPlan, factsFrom } from "@/lib/rewards/engine";
import { type PlayerStatus, playerStatus } from "@/lib/rewards/feedback";
import { previewRewards, rewardCatalog } from "@/lib/rewards/sync";

export interface MissionView {
  code: string;
  title: string;
  description: string;
  cadence: QuestDefinition["cadence"];
  xp: number;
  target: number;
  progress: number;
  complete: boolean;
  skipped: boolean;
  /** Entries logged uncategorised after the sort mission was done: a hint, not lost progress. */
  toSort: number;
}

export type AchievementState = "unlocked" | "in_progress" | "locked";

export interface AchievementView {
  code: string;
  title: string;
  description: string;
  xp: number;
  icon: string | null;
  state: AchievementState;
  progress: number;
  target: number;
  unlockedAt: string | null;
}

export interface Milestone {
  kind: "level" | "achievement";
  title: string;
  at: string;
}

export interface HistoryRow {
  key: string;
  label: string;
  xp: number;
  at: string;
}

export interface ProgressView {
  plan: RewardPlan;
  status: PlayerStatus;
  longestStreak: number;
  weeklyStreak: number;
  /** The last 7 local days, oldest first: the North Star, logged days per week. */
  week: { date: LocalDate; logged: boolean }[];
  missions: MissionView[];
  achievements: AchievementView[];
  milestones: Milestone[];
  history: HistoryRow[];
  timeZone: string;
  today: LocalDate;
}

const STATE_ORDER: Record<AchievementState, number> = { unlocked: 0, in_progress: 1, locked: 2 };

const HISTORY_LABELS: Record<string, string> = {
  logged_day: "Logged a day",
  saved_week: "Set money aside in a week",
  clean_week: "A fully sorted week",
  budget_month: "A month within your budget",
  weekly_review: "Weekly review",
};

function missionsFrom(plan: RewardPlan, quests: readonly QuestDefinition[]): MissionView[] {
  const { optedOutQuests } = factsFrom(plan.state);
  const progress = new Map(plan.result.quests.map((q) => [q.code, q]));
  return quests.flatMap((quest) => {
    const skipped = optedOutQuests.includes(quest.code);
    const current = progress.get(quest.code);
    // A catalog mission this version can't work out yet isn't shown as if it were stuck at zero.
    if (!skipped && !current) return [];
    return [
      {
        code: quest.code,
        title: quest.title,
        description: quest.description,
        cadence: quest.cadence,
        xp: quest.xp,
        target: quest.target,
        progress: current?.progress ?? 0,
        complete: current?.complete ?? false,
        skipped,
        toSort: current?.complete ? (current.toSort ?? 0) : 0,
      },
    ];
  });
}

function achievementsFrom(
  plan: RewardPlan,
  catalog: readonly AchievementDefinition[],
): AchievementView[] {
  const unlocked = new Map(plan.state.achievements.map((a) => [a.code, a.unlockedAt]));
  const progress = new Map(plan.result.achievementProgress.map((p) => [p.code, p]));
  return catalog
    .map((a) => {
      const p = progress.get(a.code) ?? { progress: 0, target: 1 };
      const at = unlocked.get(a.code) ?? null;
      const state: AchievementState =
        at !== null ? "unlocked" : p.progress > 0 ? "in_progress" : "locked";
      return {
        code: a.code,
        title: a.title,
        description: a.description,
        xp: a.xp,
        icon: a.icon,
        state,
        progress: at !== null ? p.target : p.progress,
        target: p.target,
        unlockedAt: at,
      };
    })
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
}

/** Levels reached, dated by the award that crossed each threshold, and unlocked achievements. */
function milestonesFrom(plan: RewardPlan, achievements: AchievementView[]): Milestone[] {
  const live = plan.state.events
    .filter((e) => !e.revokedAt && e.xp > 0)
    .sort((a, b) => parseInstant(a.createdAt) - parseInstant(b.createdAt));
  const out: Milestone[] = [];
  let xp = 0;
  let level = 1;
  for (const e of live) {
    xp += e.xp;
    const reached = levelFor(xp).level;
    for (let n = level + 1; n <= reached; n += 1) {
      out.push({ kind: "level", title: `Reached level ${n}`, at: e.createdAt });
    }
    level = reached;
  }
  for (const a of achievements) {
    if (a.unlockedAt) out.push({ kind: "achievement", title: a.title, at: a.unlockedAt });
  }
  return out.sort((a, b) => parseInstant(b.at) - parseInstant(a.at));
}

function historyFrom(plan: RewardPlan, catalog: Awaited<ReturnType<typeof rewardCatalog>>) {
  const quests = new Map(catalog.quests.map((q) => [q.code, q.title]));
  const achievements = new Map(catalog.achievements.map((a) => [a.code, a.title]));
  return plan.state.events
    .filter((e) => !e.revokedAt && e.xp > 0)
    .sort((a, b) => parseInstant(b.createdAt) - parseInstant(a.createdAt))
    .slice(0, 20)
    .map((e): HistoryRow => {
      const [, code = ""] = e.sourceKey.split(":");
      const label =
        e.kind === "quest"
          ? `Mission: ${quests.get(code) ?? code}`
          : e.kind === "achievement"
            ? `Achievement: ${achievements.get(code) ?? code}`
            : (HISTORY_LABELS[e.kind] ?? e.kind);
      return { key: e.sourceKey, label, xp: e.xp, at: e.createdAt };
    });
}

/**
 * Everything the progress screens show, from one preview of the reward sync (it writes nothing
 * while the page loads; `SaveEarnedRewards` saves it afterwards when it `changed`). Null when the
 * rewards can't be read: the screens then say so, and the money is untouched.
 */
export const loadProgress = cache(async (): Promise<ProgressView | null> => {
  let plan: RewardPlan;
  let catalog: Awaited<ReturnType<typeof rewardCatalog>>;
  try {
    [plan, catalog] = await Promise.all([previewRewards(), rewardCatalog()]);
  } catch {
    return null;
  }
  const profile = await getProfile();
  const today = requestToday(profile.timeZone);
  const logged = new Set(plan.result.loggedDays);
  const achievements = achievementsFrom(plan, catalog.achievements);
  return {
    plan,
    status: playerStatus(totalXp(plan.state.events), plan.streaks.currentDaily, requestNow()),
    longestStreak: plan.streaks.longestDaily,
    weeklyStreak: plan.streaks.currentWeekly,
    week: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i - 6);
      return { date, logged: logged.has(date) };
    }),
    missions: missionsFrom(plan, catalog.quests),
    achievements,
    milestones: milestonesFrom(plan, achievements),
    history: historyFrom(plan, catalog),
    timeZone: profile.timeZone,
    today,
  };
});

/** "Today", "Yesterday" or "Sat, 24 Oct" in the user's zone, for dates on the progress screens. */
export function dayOf(at: string, view: Pick<ProgressView, "timeZone" | "today">): string {
  return formatDayLabel(toLocalDate(parseInstant(at), view.timeZone), view.today);
}
