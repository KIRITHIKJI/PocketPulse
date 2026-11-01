import "server-only";

import { createHash } from "node:crypto";

import {
  type AchievementDefinition,
  OPT_OUT_PERIOD,
  type QuestDefinition,
  XP,
  startOfWeek,
  toLocalDate,
} from "@/domain";
import { DataLoadError } from "@/lib/data/errors";
import { getBudgets, getGoals, getLedger, getProfile } from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import {
  type RewardState,
  type RewardStore,
  type SyncOutcome,
  syncRewardsWith,
} from "@/lib/rewards/engine";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Reward tables are read-only to clients, so a browser can't grant itself XP. Reads use the
 * signed-in client; writes use the admin client, always for the verified session's user id, and
 * only with what the domain worked out here on the server.
 */
function supabaseStore(session: Awaited<ReturnType<typeof requireSession>>): RewardStore {
  const { supabase, userId } = session;
  const admin = createSupabaseAdminClient();
  return {
    async read(): Promise<RewardState> {
      const [events, unlocked, quests] = await Promise.all([
        supabase.from("xp_events").select("source_key, kind, xp, created_at, revoked_at"),
        supabase.from("user_achievements").select("achievement_code, unlocked_at"),
        supabase.from("user_quests").select("quest_code, period_key, completed_at, opted_out_at"),
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
          completedAt: (q.completed_at as string | null) ?? null,
          optedOutAt: (q.opted_out_at as string | null) ?? null,
        })),
      };
    },
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

export async function rewardCatalog(session: Awaited<ReturnType<typeof requireSession>>) {
  const { supabase } = session;
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
}

/** Brings the signed-in user's rewards up to date. Safe to call as often as you like. */
export async function syncRewards(): Promise<SyncOutcome> {
  const session = await requireSession();
  const [profile, ledger, goals, budgets, catalog] = await Promise.all([
    getProfile(),
    getLedger(),
    getGoals(),
    getBudgets(),
    rewardCatalog(session),
  ]);
  return syncRewardsWith(supabaseStore(session), {
    ledger,
    goals,
    budgets,
    ...catalog,
    now: requestNow(),
    settings: { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn },
  });
}

/** Records one fact worth XP. Its key makes a repeat do nothing. */
async function recordEvent(kind: string, xp: number, sourceKey: string) {
  const session = await requireSession();
  await supabaseStore(session).addEvents([{ kind, xp, sourceKey }]);
}

export async function recordWeeklyReview() {
  const profile = await getProfile();
  const today = toLocalDate(requestNow(), profile.timeZone);
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
