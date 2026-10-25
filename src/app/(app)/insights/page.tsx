import type { Metadata } from "next";
import { ChartPie } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader
        title="Insights"
        description="Where your money goes by category, merchant and period — every number opens the transactions behind it."
      />
      <SectionTabs section="insights" />
      <StatePanel
        icon={ChartPie}
        title="Not enough data for insights"
        description="Insights only appear when there are real transactions to support them. We’ll say so when a comparison is too sparse."
      />
    </>
  );
}
