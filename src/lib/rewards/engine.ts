/**
 * Runs the reward calculation against a small store, so the same logic serves the app and the
 * database tests. The domain says what's been earned; this works out what's new and saves it.
 * Keys are unique in the database too, so two syncs at once still can't award anything twice.
 */
import {
  type LocalDate,
  OPT_OUT_PERIOD,
  type RewardInput,
  type RewardResult,
  type Streaks,
  calculateRewards,
  calculateStreaks,
  toLocalDate,
} from "@/domain";

export interface StoredEvent {
  sourceKey: string;
  kind: string;
  xp: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface StoredQuest {
  questCode: string;
  periodKey: string;
  completedAt: string | null;
  optedOutAt: string | null;
}

export interface RewardState {
  events: StoredEvent[];
  achievements: { code: string; unlockedAt: string }[];
  quests: StoredQuest[];
}

export interface RewardStore {
  read(): Promise<RewardState>;
  addEvents(events: RewardResult["events"]): Promise<void>;
  addAchievements(codes: string[]): Promise<void>;
  saveQuests(
    rows: { code: string; periodKey: string; progress: number; complete: boolean }[],
  ): Promise<void>;
  saveStreaks(streaks: Streaks): Promise<void>;
}

const keysAfter = (state: RewardState, prefix: string) =>
  state.events
    .filter((e) => e.sourceKey.startsWith(prefix))
    .map((e) => e.sourceKey.slice(prefix.length));

export type RewardData = Omit<
  RewardInput,
  "reviewedWeeks" | "insightsExplored" | "optedOutQuests" | "awardedDays"
>;

/** Facts already stored, which the ledger alone can't show. */
export function factsFrom(state: RewardState) {
  return {
    reviewedWeeks: keysAfter(state, "weekly_review:") as LocalDate[],
    insightsExplored: keysAfter(state, "insight:").length,
    optedOutQuests: state.quests
      .filter((q) => q.periodKey === OPT_OUT_PERIOD && q.optedOutAt !== null)
      .map((q) => q.questCode),
    awardedDays: keysAfter(state, "logged_day:") as LocalDate[],
  };
}

export interface SyncOutcome {
  state: RewardState;
  result: RewardResult;
  streaks: Streaks;
  newAchievements: string[];
}

export interface RewardPlan extends SyncOutcome {
  newEvents: RewardResult["events"];
  /** Quest rows to save: progress on open quests, and any that just completed. */
  quests: RewardResult["quests"];
  /** True when saving would add XP, an achievement or a completed quest. */
  earnedSomething: boolean;
}

/**
 * Works out what's newly earned from what's stored, and what the stored state will be once it's
 * saved, without saving anything. The state comes from `before` plus the new rows, so nothing has
 * to be read back afterwards. Keys decide what's new, so the totals match a fresh read.
 */
export function planRewardSync(before: RewardState, data: RewardData): RewardPlan {
  const result = calculateRewards({ ...data, ...factsFrom(before) });
  const at = new Date(data.now).toISOString();

  const known = new Set(before.events.map((e) => e.sourceKey));
  const newEvents = result.events.filter((e) => !known.has(e.sourceKey));

  const unlocked = new Set(before.achievements.map((a) => a.code));
  const newAchievements = result.achievementCodes.filter((code) => !unlocked.has(code));

  const questKey = (code: string, periodKey: string) => `${code}:${periodKey}`;
  const done = new Set(
    before.quests.filter((q) => q.completedAt).map((q) => questKey(q.questCode, q.periodKey)),
  );
  const quests = result.quests.filter((q) => !done.has(questKey(q.code, q.periodKey)));
  const saved = new Map(quests.map((q) => [questKey(q.code, q.periodKey), q]));

  const today = toLocalDate(data.now, data.settings.timeZone);
  const streaks = calculateStreaks(result.loggedDays, today, data.settings);

  const state: RewardState = {
    events: [...before.events, ...newEvents.map((e) => ({ ...e, createdAt: at, revokedAt: null }))],
    achievements: [
      ...before.achievements,
      ...newAchievements.map((code) => ({ code, unlockedAt: at })),
    ],
    quests: [
      ...before.quests.map((q) => {
        const update = saved.get(questKey(q.questCode, q.periodKey));
        return update ? { ...q, completedAt: update.complete ? at : null } : q;
      }),
      ...quests
        .filter(
          (q) =>
            !before.quests.some(
              (b) => questKey(b.questCode, b.periodKey) === questKey(q.code, q.periodKey),
            ),
        )
        .map((q) => ({
          questCode: q.code,
          periodKey: q.periodKey,
          completedAt: q.complete ? at : null,
          optedOutAt: null,
        })),
    ],
  };

  return {
    state,
    result,
    streaks,
    newAchievements,
    newEvents,
    quests,
    earnedSomething:
      newEvents.length > 0 || newAchievements.length > 0 || quests.some((q) => q.complete),
  };
}

/** Saves a plan's new rows. Separate tables with their own unique keys, so the writes run at once. */
export async function saveRewardPlan(store: RewardStore, plan: RewardPlan): Promise<SyncOutcome> {
  await Promise.all([
    plan.newEvents.length > 0 ? store.addEvents(plan.newEvents) : undefined,
    plan.newAchievements.length > 0 ? store.addAchievements(plan.newAchievements) : undefined,
    plan.quests.length > 0 ? store.saveQuests(plan.quests) : undefined,
    store.saveStreaks(plan.streaks),
  ]);
  const { state, result, streaks, newAchievements } = plan;
  return { state, result, streaks, newAchievements };
}

/** Saves whatever is newly earned. Running it again with the same data changes nothing. */
export async function syncRewardsWith(store: RewardStore, data: RewardData): Promise<SyncOutcome> {
  return saveRewardPlan(store, planRewardSync(await store.read(), data));
}
