import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Rewards" };

export default function RewardsPage() {
  return (
    <>
      <PageHeader
        title="Rewards"
        description="XP, levels, streaks and achievements for logging consistently and reviewing your money — never for spending less."
      />
      <StatePanel
        icon={Trophy}
        title="Your first achievement is one entry away"
        description="Achievements like First 10 Transactions and 7-Day Logging Streak unlock from your own activity."
      />
    </>
  );
}
