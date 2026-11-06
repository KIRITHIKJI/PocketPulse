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
  /** Marks awards as revoked: what earned them no longer exists. */
  revokeEvents(sourceKeys: string[]): Promise<void>;
  /** Clears the revocation on awards that are earned again. The row is the same; no new XP. */
  restoreEvents(sourceKeys: string[]): Promise<void>;
  addAchievements(codes: string[]): Promise<void>;
  removeAchievements(codes: string[]): Promise<void>;
  saveQuests(
    rows: { code: string; periodKey: string; progress: number; complete: boolean }[],
  ): Promise<void>;
  saveStreaks(streaks: Streaks): Promise<void>;
}

const keysAfter = (state: RewardState, prefix: string) =>
  state.events
    .filter((e) => e.sourceKey.startsWith(prefix))
    .map((e) => e.sourceKey.slice(prefix.length));

export type RewardData = Omit<RewardInput, "reviewedWeeks" | "insightsExplored" | "optedOutQuests">;

/** Facts already stored, which the ledger alone can't show. */
export function factsFrom(state: RewardState) {
  return {
    reviewedWeeks: keysAfter(state, "weekly_review:") as LocalDate[],
    insightsExplored: keysAfter(state, "insight:").length,
    optedOutQuests: state.quests
      .filter((q) => q.periodKey === OPT_OUT_PERIOD && q.optedOutAt !== null)
      .map((q) => q.questCode),
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
  /** Awards whose entries are gone (undone or deleted): revoked, not deleted. */
  revokedKeys: string[];
  /** Revoked awards earned again: the same rows come back, so XP can't be earned twice. */
  restoredKeys: string[];
  removedAchievements: string[];
  /** Quest rows to save: progress on open quests, completions, and completions undone. */
  quests: RewardResult["quests"];
  /** True when saving would add XP, an achievement or a completed quest. */
  earnedSomething: boolean;
  /** True when saving would change anything stored, including taking something back. */
  changed: boolean;
}

/** Award kinds worked out from the entries alone, for all of history, so they can be reconciled. */
const LEDGER_KINDS = new Set(["logged_day", "clean_week", "saved_week", "budget_month"]);

/**
 * Works out what's newly earned, what's no longer earned, and what the stored state will be once
 * it's saved, without saving anything. The state comes from `before` plus the changes, so nothing
 * has to be read back afterwards. Keys decide everything, so the totals match a fresh read.
 *
 * Awards that come from entries follow the entries that exist now. Undoing (or deleting) the entry
 * behind an award revokes it; earning it again clears the revocation on the same row. An award
 * that isn't about entries (a weekly review, an explored insight) is never touched, and quest
 * awards are reconciled only for the current period, the only one worked out again.
 */
export function planRewardSync(before: RewardState, data: RewardData): RewardPlan {
  const result = calculateRewards({ ...data, ...factsFrom(before) });
  const at = new Date(data.now).toISOString();
  const earnedKeys = new Set(result.events.map((e) => e.sourceKey));
  const questKey = (code: string, periodKey: string) => `${code}:${periodKey}`;
  const currentQuestKeys = new Set(
    result.quests.map((q) => `quest:${questKey(q.code, q.periodKey)}`),
  );
  const reconciled = (e: StoredEvent) =>
    LEDGER_KINDS.has(e.kind) ||
    e.kind === "achievement" ||
    (e.kind === "quest" && currentQuestKeys.has(e.sourceKey));

  const known = new Set(before.events.map((e) => e.sourceKey));
  const newEvents = result.events.filter((e) => !known.has(e.sourceKey));
  const revokedKeys = before.events
    .filter((e) => e.revokedAt === null && reconciled(e) && !earnedKeys.has(e.sourceKey))
    .map((e) => e.sourceKey);
  const restoredKeys = before.events
    .filter((e) => e.revokedAt !== null && earnedKeys.has(e.sourceKey))
    .map((e) => e.sourceKey);

  const catalog = new Set(data.achievements.map((a) => a.code));
  const earnedCodes = new Set(result.achievementCodes);
  const unlocked = new Set(before.achievements.map((a) => a.code));
  const newAchievements = result.achievementCodes.filter((code) => !unlocked.has(code));
  const removedAchievements = before.achievements
    .filter((a) => catalog.has(a.code) && !earnedCodes.has(a.code))
    .map((a) => a.code);

  const stored = new Map(before.quests.map((q) => [questKey(q.questCode, q.periodKey), q]));
  // Everything open, plus anything whose completion changed. A quest that stays done isn't saved.
  const quests = result.quests.filter((q) => {
    const row = stored.get(questKey(q.code, q.periodKey));
    return !(row?.completedAt && q.complete);
  });
  const saved = new Map(quests.map((q) => [questKey(q.code, q.periodKey), q]));
  const wasComplete = (q: { code: string; periodKey: string }) =>
    Boolean(stored.get(questKey(q.code, q.periodKey))?.completedAt);

  const today = toLocalDate(data.now, data.settings.timeZone);
  const streaks = calculateStreaks(result.loggedDays, today, data.settings);

  const revoked = new Set(revokedKeys);
  const restored = new Set(restoredKeys);
  const removed = new Set(removedAchievements);
  const state: RewardState = {
    events: [
      ...before.events.map((e) =>
        revoked.has(e.sourceKey)
          ? { ...e, revokedAt: at }
          : restored.has(e.sourceKey)
            ? { ...e, revokedAt: null }
            : e,
      ),
      ...newEvents.map((e) => ({ ...e, createdAt: at, revokedAt: null })),
    ],
    achievements: [
      ...before.achievements.filter((a) => !removed.has(a.code)),
      ...newAchievements.map((code) => ({ code, unlockedAt: at })),
    ],
    quests: [
      ...before.quests.map((q) => {
        const update = saved.get(questKey(q.questCode, q.periodKey));
        return update ? { ...q, completedAt: update.complete ? (q.completedAt ?? at) : null } : q;
      }),
      ...quests
        .filter((q) => !stored.has(questKey(q.code, q.periodKey)))
        .map((q) => ({
          questCode: q.code,
          periodKey: q.periodKey,
          completedAt: q.complete ? at : null,
          optedOutAt: null,
        })),
    ],
  };

  const earnedSomething =
    newEvents.length > 0 ||
    restoredKeys.length > 0 ||
    newAchievements.length > 0 ||
    quests.some((q) => q.complete && !wasComplete(q));
  return {
    state,
    result,
    streaks,
    newAchievements,
    newEvents,
    revokedKeys,
    restoredKeys,
    removedAchievements,
    quests,
    earnedSomething,
    changed:
      earnedSomething ||
      revokedKeys.length > 0 ||
      removedAchievements.length > 0 ||
      quests.some((q) => !q.complete && wasComplete(q)),
  };
}

/** Saves a plan's changes. Separate tables and disjoint keys, so the writes run at once. */
export async function saveRewardPlan(store: RewardStore, plan: RewardPlan): Promise<SyncOutcome> {
  await Promise.all([
    plan.newEvents.length > 0 ? store.addEvents(plan.newEvents) : undefined,
    plan.revokedKeys.length > 0 ? store.revokeEvents(plan.revokedKeys) : undefined,
    plan.restoredKeys.length > 0 ? store.restoreEvents(plan.restoredKeys) : undefined,
    plan.newAchievements.length > 0 ? store.addAchievements(plan.newAchievements) : undefined,
    plan.removedAchievements.length > 0
      ? store.removeAchievements(plan.removedAchievements)
      : undefined,
    plan.quests.length > 0 ? store.saveQuests(plan.quests) : undefined,
    store.saveStreaks(plan.streaks),
  ]);
  const { state, result, streaks, newAchievements } = plan;
  return { state, result, streaks, newAchievements };
}

/** Brings the stored rewards in line with the data. Running it again changes nothing. */
export async function syncRewardsWith(store: RewardStore, data: RewardData): Promise<SyncOutcome> {
  return saveRewardPlan(store, planRewardSync(await store.read(), data));
}
