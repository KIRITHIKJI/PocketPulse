"use client";

import * as React from "react";

import {
  SEEN_ACHIEVEMENTS_KEY,
  markAchievementsSeen,
  useRewardFeedback,
} from "@/components/feedback/reward-feedback";
import { useToast } from "@/components/feedback/toast";

/** Older unlocks are history, not news: a new device doesn't greet them. */
const RECENT_MS = 7 * 24 * 60 * 60_000;

/**
 * Greets, once per device, an achievement unlocked in the last week that this device hasn't
 * shown yet (say, one earned on the phone, opened on the laptop). It goes through the same queue
 * as everything else, so it never covers another pop-up. Everything shown is marked seen.
 */
export function GreetAchievements({
  unlocked,
  now,
}: {
  unlocked: { code: string; title: string; unlockedAt: string }[];
  now: number;
}) {
  const { enabled } = useRewardFeedback();
  const { reward } = useToast();
  React.useEffect(() => {
    let seen: string[] = [];
    try {
      seen = JSON.parse(window.localStorage.getItem(SEEN_ACHIEVEMENTS_KEY) ?? "[]") as string[];
    } catch {
      // Blocked storage: greet nothing, rather than the same achievement on every visit.
      return;
    }
    const fresh = unlocked.filter(
      (a) => !seen.includes(a.code) && now - Date.parse(a.unlockedAt) < RECENT_MS,
    );
    markAchievementsSeen(unlocked.map((a) => a.code));
    if (!enabled || fresh.length === 0) return;
    reward("achievement", {
      tone: "milestone",
      title: fresh.length === 1 ? "Achievement unlocked" : `${fresh.length} achievements unlocked`,
      message: fresh.map((a) => a.title).join(", "),
    });
  }, [unlocked, now, enabled, reward]);
  return null;
}
