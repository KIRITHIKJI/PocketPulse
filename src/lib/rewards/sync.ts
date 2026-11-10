import "server-only";

import { createHash } from "node:crypto";

import { cache } from "react";

import {
  type AchievementDefinition,
  OPT_OUT_PERIOD,
  type QuestDefinition,
  XP,
  startOfWeek,
} from "@/domain";
import { DataLoadError } from "@/lib/data/errors";
import {
  getBudgets,
  getGoals,
  getLedger,
  getLedgerStampsSince,
  getProfile,
  readLedgerNow,
} from "@/lib/data/queries";
import { type Session, requestNow, requestToday, requireSession } from "@/lib/data/session";
import {
  type RewardData,
  type RewardPlan,
  type RewardState,
  type RewardStore,
  type SyncOutcome,
  planRewardSync,
  settleRewardSync,
} from "@/lib/rewards/engine";
import { type RewardFeedback, rewardFeedback } from "@/lib/rewards/feedback";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The user's stored rewards, read with their own client (RLS: their rows only). */
async function readRewardState({ supabase }: Session): Promise<RewardState> {
  const [events, unlocked, quests] = await Promise.all([
    supabase.from("xp_events").select("source_key, kind, xp, created_at, revoked_at"),
    supabase.from("user_achievements").select("achievement_code, unlocked_at"),
    supabase
      .from("user_quests")
      .select("quest_code, period_key, progress, completed_at, opted_out_at"),
  ]);
  const error = events.error ?? unlocked.error ?? quests.error;
  if (error) throw new DataLoadError("your rewards", error.code);
  return {
    events: (events.data ?? []).map((e) => ({
      sourceKey: e.source_key as string,
      kind: e.kind as string,
      xp: Number(e.xp),
      createdAt: e.created_at as string,
      revokedAt: (e.revoked_at as string | null) ?? null,
    })),
    achievements: (unlocked.data ?? []).map((a) => ({
      code: a.achievement_code as string,
      unlockedAt: a.unlocked_at as string,
    })),
    quests: (quests.data ?? []).map((q) => ({
      questCode: q.quest_code as string,
      periodKey: q.period_key as string,
      progress: Number(q.progress ?? 0),
      completedAt: (q.completed_at as string | null) ?? null,
      optedOutAt: (q.opted_out_at as string | null) ?? null,
    })),
  };
}

/**
 * Reward tables are read-only to clients, so a browser can't grant itself XP. Reads use the
 * signed-in client; writes use the admin client, always for the verified session's user id, and
 * only with what the domain worked out here on the server.
 */
function supabaseStore(session: Session): RewardStore {
  const { userId } = session;
  const admin = createSupabaseAdminClient();
  return {
    read: () => readRewardState(session),
    async addEvents(events) {
      const { error } = await admin.from("xp_events").upsert(
        events.map((e) => ({
          owner_id: userId,
          kind: e.kind,
          xp: e.xp,
          source_key: e.sourceKey,
        })),
        { onConflict: "owner_id,source_key", ignoreDuplicates: true },
      );
      if (error) throw new DataLoadError("your rewards", error.code);
    },
    async revokeEvents(keys) {
      const { error } = await admin
        .from("xp_events")
        .update({ revoked_at: new Date().toISOString() })
        .eq("owner_id", userId)
        .in("source_key", keys)
        .is("revoked_at", null);
      if (error) throw new DataLoadError("your rewards", error.code);
    },
    async restoreEvents(keys) {
      const { error } = await admin
        .from("xp_events")
        .update({ revoked_at: null })
        .eq("owner_id", userId)
        .in("source_key", keys);
      if (error) throw new DataLoadError("your rewards", error.code);
    },
    async addAchievements(codes) {
      const { error } = await admin.from("user_achievements").upsert(
        codes.map((code) => ({ owner_id: userId, achievement_code: code })),
        { onConflict: "owner_id,achievement_code", ignoreDuplicates: true },
      );
      if (error) throw new DataLoadError("your rewards", error.code);
    },
    async saveQuests(rows) {
      const { error } = await admin.from("user_quests").upsert(
        rows.map((q) => ({
          owner_id: userId,
          quest_code: q.code,
          period_key: q.periodKey,
          progress: q.progress,
          completed_at: q.complete ? new Date().toISOString() : null,
        })),
        { onConflict: "owner_id,quest_code,period_key" },
      );
      if (error) throw new DataLoadError("your rewards", error.code);
    },
    async saveStreaks(s) {
      const { error } = await admin.from("streak_state").upsert({
        owner_id: userId,
        current_daily: s.currentDaily,
        longest_daily: s.longestDaily,
        last_logged_date: s.lastLoggedDate,
        current_weekly: s.currentWeekly,
        longest_weekly: s.longestWeekly,
        last_logged_week: s.lastLoggedWeek,
      });
      if (error) throw new DataLoadError("your rewards", error.code);
    },
  };
}

/** Achievement and quest definitions. Read once per request, however many callers need them. */
export const rewardCatalog = cache(async () => {
  const { supabase } = await requireSession();
  const [achievements, quests] = await Promise.all([
    supabase.from("achievements").select("*").order("sort_order"),
    supabase.from("quests").select("*").order("sort_order"),
  ]);
  const error = achievements.error ?? quests.error;
  if (error) throw new DataLoadError("rewards", error.code);
  return {
    achievements: (achievements.data ?? []) as AchievementDefinition[],
    quests: (quests.data ?? []) as QuestDefinition[],
  };
});

/** Pass 1 shares the request's ledger read; a later pass reads again, because the ledger moved. */
async function rewardData(pass = 1): Promise<RewardData> {
  const [profile, ledger, goals, budgets, catalog] = await Promise.all([
    getProfile(),
    pass === 1 ? getLedger() : readLedgerNow(),
    getGoals(),
    getBudgets(),
    rewardCatalog(),
  ]);
  return {
    ledger,
    goals,
    budgets,
    ...catalog,
    now: requestNow(),
    settings: { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn },
  };
}

async function settle(session: Session, options: SyncOptions) {
  return settleRewardSync(supabaseStore(session), rewardData, getLedgerStampsSince, options);
}

/**
 * `revoke`: the sync follows a delete, an Undo or an edit, so something behind an award may be
 * gone and it may be taken back. Logging something new never costs XP.
 */
export type SyncOptions = { revoke: boolean };

/**
 * Brings the signed-in user's rewards up to date. Safe to call as often as you like, and safe
 * against an Undo landing mid-sync: if the ledger moved, it runs again (`settleRewardSync`).
 */
export async function syncRewards(options: SyncOptions): Promise<SyncOutcome> {
  return (await settle(await requireSession(), options)).outcome;
}

/** A sync that also says what it changed, for the feedback chain after a save. */
export async function syncRewardsWithFeedback(): Promise<RewardFeedback> {
  const session = await requireSession();
  const [{ before, outcome }, catalog] = await Promise.all([
    settle(session, { revoke: false }),
    rewardCatalog(),
  ]);
  return rewardFeedback(
    before,
    outcome.state,
    outcome.result,
    catalog,
    outcome.streaks.currentDaily,
    Date.now(),
  );
}

/**
 * What the rewards page shows: the stored rewards plus anything newly earned, worked out the same
 * way as a sync but without saving, so opening the page writes nothing. When `changed`
 * is true (something earned, or something no longer earned) the page asks the server to save it
 * afterwards (`saveEarnedRewards`).
 */
export async function previewRewards(): Promise<RewardPlan> {
  const session = await requireSession();
  const [before, data] = await Promise.all([readRewardState(session), rewardData()]);
  return planRewardSync(before, data, { revoke: false });
}

/** Records one fact worth XP. Its key makes a repeat do nothing. */
async function recordEvent(kind: string, xp: number, sourceKey: string) {
  const session = await requireSession();
  await supabaseStore(session).addEvents([{ kind, xp, sourceKey }]);
}

/** "Looked at today": a zero-XP fact that the Look at today mission reads. Once per day. */
export async function recordTodayReviewed() {
  const profile = await getProfile();
  await recordEvent("daily_review", 0, `daily_review:${requestToday(profile.timeZone)}`);
}

export async function recordWeeklyReview() {
  const profile = await getProfile();
  const today = requestToday(profile.timeZone);
  const week = startOfWeek(today, profile.weekStartsOn);
  await recordEvent("weekly_review", XP.weeklyReview, `weekly_review:${week}`);
}

/** Opening the entries behind an insight. No XP of its own: it counts toward Spending Detective. */
export async function recordInsightExplored(scope: string) {
  const digest = createHash("sha256").update(scope).digest("hex").slice(0, 24);
  await recordEvent("insight_explored", 0, `insight:${digest}`);
}

export async function setQuestOptOut(code: string, optedOut: boolean) {
  const session = await requireSession();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("user_quests").upsert(
    {
      owner_id: session.userId,
      quest_code: code,
      period_key: OPT_OUT_PERIOD,
      opted_out_at: optedOut ? new Date().toISOString() : null,
    },
    { onConflict: "owner_id,quest_code,period_key" },
  );
  if (error) throw new DataLoadError("your quests", error.code);
}
