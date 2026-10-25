import type { Metadata } from "next";
import { PiggyBank } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Savings goals" };

export default function GoalsPage() {
  return (
    <>
      <PageHeader
        title="Savings goals"
        description="Earmark money for things you care about. Allocations are not spending and don’t change your total balance."
      />
      <SectionTabs section="plan" />
      <StatePanel
        icon={PiggyBank}
        title="No savings goals yet"
        description="Create a goal like “Laptop” with a target and date to see progress and a suggested weekly amount."
      />
    </>
  );
}
