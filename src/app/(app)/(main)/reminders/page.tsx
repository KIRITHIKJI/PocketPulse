import type { Metadata } from "next";
import { Bell } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Reminders" };

export default function RemindersPage() {
  return (
    <>
      <PageHeader
        title="Reminders"
        description="Optional, quiet nudges for logging, weekly reviews, allowance day and upcoming bills. All off by default."
      />
      <StatePanel
        icon={Bell}
        title="No reminders on"
        description="Turn on only the reminders you want and choose how often. You can switch all of them off at once."
      />
    </>
  );
}
