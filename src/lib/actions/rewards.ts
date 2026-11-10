"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type FormState, text } from "@/lib/forms";
import type { RewardFeedback } from "@/lib/rewards/feedback";
import {
  recordInsightExplored,
  recordTodayReviewed,
  recordWeeklyReview,
  setQuestOptOut,
  syncRewards,
  syncRewardsWithFeedback,
} from "@/lib/rewards/sync";

const FAILED = "Couldn’t save that. Try again in a moment.";

/**
 * Called by the client right after a save is answered. This is the save's reward sync (the save
 * itself never waits for it), and it says what changed. The server works everything out from the
 * user's own data, so the browser only ever displays what it's told.
 */
export async function syncRewardFeedback(): Promise<RewardFeedback | null> {
  try {
    return await syncRewardsWithFeedback();
  } catch {
    // Rewards are never worth an error after a save; the next sync catches up.
    return null;
  }
}

/** Opening today's breakdown. Once a day; a repeat records nothing new. */
export async function noteTodayReviewed(): Promise<RewardFeedback | null> {
  try {
    await recordTodayReviewed();
    return await syncRewardsWithFeedback();
  } catch {
    return null;
  }
}

/** "I've reviewed this week", from a mission row. */
export async function markWeekReviewed(): Promise<
  { ok: true; feedback: RewardFeedback } | { ok: false; message: string }
> {
  try {
    await recordWeeklyReview();
    const feedback = await syncRewardsWithFeedback();
    revalidatePath("/rewards", "layout");
    return { ok: true, feedback };
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function changeQuest(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = z
    .string()
    .regex(/^[a-z0-9_]{2,40}$/)
    .safeParse(text(formData, "code"));
  if (!code.success) return { status: "error", message: FAILED };
  try {
    await setQuestOptOut(code.data, text(formData, "optOut") === "true");
  } catch {
    return { status: "error", message: FAILED };
  }
  revalidatePath("/rewards", "layout");
  return { status: "success", message: "Saved.", savedAt: Date.now() };
}

/** Fire-and-forget from History: a failure costs a step toward one badge, nothing else. */
export async function noteInsightExplored(scope: unknown): Promise<void> {
  const parsed = z.string().min(1).max(500).safeParse(scope);
  if (!parsed.success) return;
  try {
    await recordInsightExplored(parsed.data);
    await syncRewards({ revoke: false });
  } catch {
    // Rewards are never worth an error on a page someone is reading.
  }
}

/**
 * Called by the rewards pages once they're on screen, only when they showed something that
 * changed. The server works it out again from the user's own data, so the browser can't choose
 * what's saved.
 */
export async function saveEarnedRewards(): Promise<void> {
  try {
    await syncRewards({ revoke: false });
  } catch {
    // Saved on the next entry or visit instead; keys make that the same result.
  }
}
