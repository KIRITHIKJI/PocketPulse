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
  type Transaction,
  calculateRewards,
  calculateStreaks,
  parseInstant,
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
  progress: number;
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
  "reviewedWeeks" | "reviewedDays" | "insightsExplored" | "optedOutQuests" | "keptKeys"
>;

/** Facts already stored, which the ledger alone can't show. */
export function factsFrom(state: RewardState) {
  return {
    reviewedWeeks: keysAfter(state, "weekly_review:") as LocalDate[],
    reviewedDays: keysAfter(state, "daily_review:") as LocalDate[],
    insightsExplored: keysAfter(state, "insight:").length,
    optedOutQuests: state.quests
      .filter((q) => q.periodKey === OPT_OUT_PERIOD && q.optedOutAt !== null)
      .map((q) => q.questCode),
    keptKeys: new Set(state.events.filter((e) => e.revokedAt === null).map((e) => e.sourceKey)),
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
 * Daily awards and mission progress follow the entries that exist now. Undoing (or deleting) the
 * entry behind one revokes it; earning it again clears the revocation on the same row. Only a
 * sync that follows a delete, an Undo or an edit (`revoke`) takes anything back: logging a new
 * entry never costs XP, and a mission done for its day or week stays done (spec: don't punish
 * expenses). Sorting awards stay earned once their week was sorted (`keptKeys`). Mission awards
 * are reconciled only for the current period, the only one worked out again.
 * Achievements are the exception: each is unique and can't be farmed, so once earned it stays
 * unlocked, with its XP, whatever happens to the entries later.
 * An award that isn't about entries (a weekly review, an explored insight) is never touched.
 */
export function planRewardSync(
  before: RewardState,
  data: RewardData,
  { revoke }: { revoke: boolean },
): RewardPlan {
  const calculated = calculateRewards({ ...data, ...factsFrom(before) });
  // Unless something behind an award may be gone, a mission done for its day or week stays done.
  const doneBefore = new Set(
    before.quests.filter((q) => q.completedAt).map((q) => `${q.questCode}:${q.periodKey}`),
  );
  const result: RewardResult = revoke
    ? calculated
    : {
        ...calculated,
        quests: calculated.quests.map((q) =>
          !q.complete && doneBefore.has(`${q.code}:${q.periodKey}`)
            ? { ...q, complete: true, progress: q.target }
            : q,
        ),
      };
  const at = new Date(data.now).toISOString();
  const earnedKeys = new Set(result.events.map((e) => e.sourceKey));
  const questKey = (code: string, periodKey: string) => `${code}:${periodKey}`;
  const currentQuestKeys = new Set(
    result.quests.map((q) => `quest:${questKey(q.code, q.periodKey)}`),
  );
  const reconciled = (e: StoredEvent) =>
    LEDGER_KINDS.has(e.kind) || (e.kind === "quest" && currentQuestKeys.has(e.sourceKey));

  const known = new Set(before.events.map((e) => e.sourceKey));
  const newEvents = result.events.filter((e) => !known.has(e.sourceKey));
  const revokedKeys = revoke
    ? before.events
        .filter((e) => e.revokedAt === null && reconciled(e) && !earnedKeys.has(e.sourceKey))
        .map((e) => e.sourceKey)
    : [];
  const restoredKeys = before.events
    .filter((e) => e.revokedAt !== null && earnedKeys.has(e.sourceKey))
    .map((e) => e.sourceKey);

  const unlocked = new Set(before.achievements.map((a) => a.code));
  const newAchievements = result.achievementCodes.filter((code) => !unlocked.has(code));

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
      ...before.achievements,
      ...newAchievements.map((code) => ({ code, unlockedAt: at })),
    ],
    quests: [
      ...before.quests.map((q) => {
        const update = saved.get(questKey(q.questCode, q.periodKey));
        return update
          ? {
              ...q,
              progress: update.progress,
              completedAt: update.complete ? (q.completedAt ?? at) : null,
            }
          : q;
      }),
      ...quests
        .filter((q) => !stored.has(questKey(q.code, q.periodKey)))
        .map((q) => ({
          questCode: q.code,
          periodKey: q.periodKey,
          progress: q.progress,
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
    quests,
    earnedSomething,
    changed:
      earnedSomething ||
      revokedKeys.length > 0 ||
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
    plan.quests.length > 0 ? store.saveQuests(plan.quests) : undefined,
    store.saveStreaks(plan.streaks),
  ]);
  const { state, result, streaks, newAchievements } = plan;
  return { state, result, streaks, newAchievements };
}

/** Brings the stored rewards in line with the data. Running it again changes nothing. */
export async function syncRewardsWith(
  store: RewardStore,
  data: RewardData,
  options: { revoke: boolean },
): Promise<SyncOutcome> {
  return saveRewardPlan(store, planRewardSync(await store.read(), data, options));
}

/** A ledger row as it is now, for checking whether the ledger moved during a sync. */
export interface LedgerStamp {
  id: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * True when rows changed since `snapshot` was read: a row that's new, edited, or deleted since.
 * `stamps` are the rows touched around the read (deleted ones included). A row deleted before the
 * read isn't in the snapshot, so it's no change; at worst this says "changed" once too often,
 * which costs one more pass and never a wrong award.
 */
export function ledgerChanged(snapshot: readonly Transaction[], stamps: readonly LedgerStamp[]) {
  const byId = new Map(snapshot.map((tx) => [tx.id, tx]));
  return stamps.some((row) => {
    const seen = byId.get(row.id);
    if (row.deletedAt !== null) return seen !== undefined;
    return !seen || parseInstant(seen.updatedAt) !== parseInstant(row.updatedAt);
  });
}

/**
 * True when a row in `snapshot` was deleted or edited since: a delete, an Undo or an edit landed
 * during the sync. A brand-new row isn't: logging more never takes anything back.
 */
export function ledgerRewritten(snapshot: readonly Transaction[], stamps: readonly LedgerStamp[]) {
  const byId = new Map(snapshot.map((tx) => [tx.id, tx]));
  return stamps.some((row) => {
    const seen = byId.get(row.id);
    return (
      seen !== undefined &&
      (row.deletedAt !== null || parseInstant(seen.updatedAt) !== parseInstant(row.updatedAt))
    );
  });
}

/** How far a settle may go: the ledger rarely moves twice in one sync, so 3 passes is plenty. */
const MAX_PASSES = 3;

/**
 * A sync that can't leave a stale award behind. If the ledger moved while it ran (an Undo landing
 * during the save's own sync), what it saved may be out of date, so it runs again from a fresh
 * read until a pass finds nothing new. Returns the state from before the first pass too, so the
 * caller can say what changed overall. A delete, Undo or edit that landed meanwhile lets the
 * next pass take back what it earned, even when this sync followed a save.
 */
export async function settleRewardSync(
  store: RewardStore,
  load: (pass: number) => Promise<RewardData>,
  changesSince: (startedAt: string) => Promise<LedgerStamp[]>,
  options: { revoke: boolean },
): Promise<{ before: RewardState; outcome: SyncOutcome; passes: number }> {
  let first: RewardState | null = null;
  let { revoke } = options;
  for (let pass = 1; ; pass += 1) {
    // A second early, so a row written just before the read can't be missed by clock skew.
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const [before, data] = await Promise.all([store.read(), load(pass)]);
    first ??= before;
    const outcome = await saveRewardPlan(store, planRewardSync(before, data, { revoke }));
    const stamps = await changesSince(startedAt);
    if (pass >= MAX_PASSES || !ledgerChanged(data.ledger, stamps)) {
      return { before: first, outcome, passes: pass };
    }
    revoke ||= ledgerRewritten(data.ledger, stamps);
  }
}
