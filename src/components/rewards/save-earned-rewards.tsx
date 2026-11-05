"use client";

import * as React from "react";

import { saveEarnedRewards } from "@/lib/actions/rewards";

/**
 * The rewards page shows newly earned rewards before they're stored, so opening it writes nothing
 * while it loads. This saves them once the page is on screen. It shows nothing itself.
 */
export function SaveEarnedRewards() {
  React.useEffect(() => {
    void saveEarnedRewards();
  }, []);
  return null;
}
