"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type FormState, text } from "@/lib/forms";
import {
  recordInsightExplored,
  recordWeeklyReview,
  setQuestOptOut,
  syncRewards,
} from "@/lib/rewards/sync";

const FAILED = "Couldn’t save that. Try again in a moment.";

export async function completeWeeklyReview(_prev: FormState): Promise<FormState> {
  try {
    await recordWeeklyReview();
    await syncRewards();
  } catch {
    return { status: "error", message: FAILED };
  }
  revalidatePath("/rewards");
  return { status: "success", message: "Weekly review done.", savedAt: Date.now() };
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
  revalidatePath("/rewards");
  return { status: "success", message: "Saved.", savedAt: Date.now() };
}

/** Fire-and-forget from History: a failure costs a step toward one badge, nothing else. */
export async function noteInsightExplored(scope: unknown): Promise<void> {
  const parsed = z.string().min(1).max(500).safeParse(scope);
  if (!parsed.success) return;
  try {
    await recordInsightExplored(parsed.data);
    await syncRewards();
  } catch {
    // Rewards are never worth an error on a page someone is reading.
  }
}

/**
 * Called by the rewards page once it's on screen, only when it showed something newly earned. The
 * server works it out again from the user's own data, so the browser can't choose what's saved.
 */
export async function saveEarnedRewards(): Promise<void> {
  try {
    await syncRewards();
  } catch {
    // Saved on the next entry or visit instead; keys make that the same result.
  }
}
