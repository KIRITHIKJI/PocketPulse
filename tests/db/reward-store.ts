import type { AchievementDefinition, QuestDefinition } from "@/domain";
import type { RewardStore } from "@/lib/rewards/engine";

import type { TestDb } from "./harness";

/** What the admin client does: writes as the server, for one user id, with the same keys. */
export function pgRewardStore(db: TestDb, userId: string): RewardStore {
  const q = (text: string, params: unknown[]) => db.client.query(text, params);
  return {
    async read() {
      const events = await q("select * from public.xp_events where owner_id = $1", [userId]);
      const unlocked = await q("select * from public.user_achievements where owner_id = $1", [
        userId,
      ]);
      const quests = await q("select * from public.user_quests where owner_id = $1", [userId]);
      return {
        events: events.rows.map((e) => ({
          sourceKey: e.source_key,
          kind: e.kind,
          xp: e.xp,
          createdAt: e.created_at,
          revokedAt: e.revoked_at,
        })),
        achievements: unlocked.rows.map((a) => ({
          code: a.achievement_code,
          unlockedAt: a.unlocked_at,
        })),
        quests: quests.rows.map((r) => ({
          questCode: r.quest_code,
          periodKey: r.period_key,
          progress: r.progress,
          completedAt: r.completed_at,
          optedOutAt: r.opted_out_at,
        })),
      };
    },
    async addEvents(events) {
      for (const e of events) {
        await q(
          `insert into public.xp_events (owner_id, kind, xp, source_key) values ($1, $2, $3, $4)
           on conflict (owner_id, source_key) do nothing`,
          [userId, e.kind, e.xp, e.sourceKey],
        );
      }
    },
    async revokeEvents(keys) {
      await q(
        `update public.xp_events set revoked_at = now()
         where owner_id = $1 and source_key = any($2) and revoked_at is null`,
        [userId, keys],
      );
    },
    async restoreEvents(keys) {
      await q(
        "update public.xp_events set revoked_at = null where owner_id = $1 and source_key = any($2)",
        [userId, keys],
      );
    },
    async addAchievements(codes) {
      for (const code of codes) {
        await q(
          `insert into public.user_achievements (owner_id, achievement_code) values ($1, $2)
           on conflict do nothing`,
          [userId, code],
        );
      }
    },
    async saveQuests(rows) {
      for (const r of rows) {
        await q(
          `insert into public.user_quests (owner_id, quest_code, period_key, progress, completed_at)
           values ($1, $2, $3, $4, case when $5 then now() end)
           on conflict (owner_id, quest_code, period_key)
           do update set progress = excluded.progress, completed_at = excluded.completed_at`,
          [userId, r.code, r.periodKey, r.progress, r.complete],
        );
      }
    },
    async saveStreaks(s) {
      await q(
        `update public.streak_state set current_daily = $2, longest_daily = $3 where owner_id = $1`,
        [userId, s.currentDaily, s.longestDaily],
      );
    },
  };
}

export async function rewardCatalog(db: TestDb) {
  const achievements = await db.client.query("select * from public.achievements");
  const quests = await db.client.query("select * from public.quests");
  return {
    achievements: achievements.rows as AchievementDefinition[],
    quests: quests.rows as QuestDefinition[],
  };
}
