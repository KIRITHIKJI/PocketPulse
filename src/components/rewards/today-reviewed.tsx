"use client";

import * as React from "react";

import { useRewardFeedback } from "@/components/feedback/reward-feedback";
import { noteTodayReviewed } from "@/lib/actions/rewards";

const KEY = "pp-reviewed-day";

/**
 * Opening today's breakdown is the "Look at today" mission. Noted once per day on this device
 * (the server's key makes any repeat harmless anyway), after the page is on screen. Shows
 * nothing itself; a completed mission arrives through the feedback ladder.
 */
export function TodayReviewed({ today }: { today: string }) {
  const { present } = useRewardFeedback();
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === today) return;
      window.localStorage.setItem(KEY, today);
    } catch {
      // Without storage it's noted on each visit; the key keeps that to one award.
    }
    void noteTodayReviewed()
      .then((feedback) => present(feedback))
      .catch(() => undefined);
  }, [today, present]);
  return null;
}
