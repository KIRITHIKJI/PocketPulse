"use client";

import * as React from "react";

import { useRewardFeedback } from "@/components/feedback/reward-feedback";
import { useToast } from "@/components/feedback/toast";
import { Button } from "@/components/ui/button";
import { markWeekReviewed } from "@/lib/actions/rewards";

/** "I've reviewed this week": the server records it, and the ladder shows what it completed. */
export function ReviewWeekButton() {
  const { present } = useRewardFeedback();
  const { show } = useToast();
  const [pending, start] = React.useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const result = await markWeekReviewed().catch(() => null);
          if (result?.ok) present(result.feedback);
          else
            show({ tone: "error", message: result?.message ?? "Couldn’t save that. Try again." });
        })
      }
    >
      I’ve reviewed this week
    </Button>
  );
}
