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

/** Saves whatever is newly earned. Running it again with the same data changes nothing. */
export async function syncRewardsWith(store: RewardStore, data: RewardData): Promise<SyncOutcome> {
  const before = await store.read();
  const result = calculateRewards({ ...data, ...factsFrom(before) });

  const known = new Set(before.events.map((e) => e.sourceKey));
  const newEvents = result.events.filter((e) => !known.has(e.sourceKey));
  if (newEvents.length > 0) await store.addEvents(newEvents);

  const unlocked = new Set(before.achievements.map((a) => a.code));
  const newAchievements = result.achievementCodes.filter((code) => !unlocked.has(code));
  if (newAchievements.length > 0) await store.addAchievements(newAchievements);

  const done = new Set(
    before.quests.filter((q) => q.completedAt).map((q) => `${q.questCode}:${q.periodKey}`),
  );
  const quests = result.quests.filter((q) => !done.has(`${q.code}:${q.periodKey}`));
  if (quests.length > 0) await store.saveQuests(quests);

  const today = toLocalDate(data.now, data.settings.timeZone);
  const streaks = calculateStreaks(result.loggedDays, today, data.settings);
  await store.saveStreaks(streaks);

  return { state: await store.read(), result, streaks, newAchievements };
}
