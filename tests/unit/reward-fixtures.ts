import { type AchievementDefinition, type QuestDefinition, type Transaction } from "@/domain";
import type { RewardData, RewardState, RewardStore } from "@/lib/rewards/engine";

import { expense, ist, istMs } from "./domain/fixtures";

export const IST = { timeZone: "Asia/Kolkata", weekStartsOn: 1 } as const;
export const NOW = istMs("2026-11-11", "18:00"); // a Wednesday
export const TODAY = "2026-11-11";

export const ACHIEVEMENTS: AchievementDefinition[] = [
  ["first_10_transactions", 50],
  ["streak_7_day", 70],
  ["no_mystery_money", 60],
  ["first_savings_goal", 40],
  ["monthly_budget_achieved", 100],
  ["spending_detective", 40],
  ["weekly_review_complete", 30],
].map(([code, xp]) => ({
  code: code as string,
  xp: xp as number,
  title: String(code),
  description: "",
  icon: null,
}));
export const QUESTS: QuestDefinition[] = [
  ["log_today", "daily", 5],
  ["categorise_week", "weekly", 20],
  ["weekly_review", "weekly", 15],
  ["set_a_goal", "once", 20],
].map(([code, cadence, xp]) => ({
  code: code as string,
  cadence: cadence as QuestDefinition["cadence"],
  xp: xp as number,
  target: 1,
  title: String(code),
  description: "",
}));

/** The whole mission catalog, as the migrations seed it (0500 plus Design 3's 20261106000200). */
export const MISSIONS: QuestDefinition[] = (
  [
    ["log_today", "daily", 1, 5],
    ["categorise_week", "weekly", 1, 20],
    ["weekly_review", "weekly", 1, 15],
    ["set_a_goal", "once", 1, 20],
    ["review_today", "daily", 1, 5],
    ["set_aside_week", "weekly", 1, 10],
    ["steady_logging", "once", 20, 40],
    ["saving_habit", "once", 4, 30],
  ] as const
).map(([code, cadence, target, xp]) => ({
  code,
  cadence,
  target,
  xp,
  title: code,
  description: "",
}));

/** An entry logged at that moment, whatever date it's for. */
export const logged = (when: string, o: Parameters<typeof expense>[1] = {}, amount = 2_000) => {
  const tx = expense(amount, { occurredAt: when, ...o });
  return { ...tx, createdAt: when, updatedAt: when };
};
export const day = (n: number, time = "12:00") =>
  ist(`2026-11-${String(n).padStart(2, "0")}`, time);

export function data(ledger: Transaction[], extra: Partial<RewardData> = {}): RewardData {
  return {
    ledger,
    goals: [],
    budgets: [],
    achievements: ACHIEVEMENTS,
    quests: QUESTS,
    now: NOW,
    settings: IST,
    ...extra,
  };
}

/** The database's one rule that matters here: one row per key. */
export function memoryStore(): RewardStore & { state: RewardState } {
  const state: RewardState = { events: [], achievements: [], quests: [] };
  return {
    get state() {
      return state;
    },
    async read() {
      return structuredClone(state);
    },
    async addEvents(events) {
      for (const e of events) {
        if (state.events.some((s) => s.sourceKey === e.sourceKey)) continue;
        state.events.push({ ...e, createdAt: ist("2026-11-11"), revokedAt: null });
      }
    },
    async revokeEvents(keys) {
      for (const e of state.events) {
        if (keys.includes(e.sourceKey) && e.revokedAt === null) e.revokedAt = ist("2026-11-11");
      }
    },
    async restoreEvents(keys) {
      for (const e of state.events) if (keys.includes(e.sourceKey)) e.revokedAt = null;
    },
    async addAchievements(codes) {
      for (const code of codes) {
        if (!state.achievements.some((a) => a.code === code)) {
          state.achievements.push({ code, unlockedAt: ist("2026-11-11") });
        }
      }
    },
    async saveQuests(rows) {
      for (const q of rows) {
        const found = state.quests.find(
          (s) => s.questCode === q.code && s.periodKey === q.periodKey,
        );
        const completedAt = q.complete ? ist("2026-11-11") : null;
        if (found) {
          found.progress = q.progress;
          found.completedAt = q.complete ? (found.completedAt ?? completedAt) : null;
        } else {
          state.quests.push({
            questCode: q.code,
            periodKey: q.periodKey,
            progress: q.progress,
            completedAt,
            optedOutAt: null,
          });
        }
      }
    },
    async saveStreaks() {},
  };
}
