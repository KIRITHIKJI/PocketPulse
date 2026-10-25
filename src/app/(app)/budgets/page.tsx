import type { Metadata } from "next";
import { Target } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly targets for total spending and each category. Budgets guide you — they never block a purchase."
      />
      <SectionTabs section="plan" />
      <StatePanel
        icon={Target}
        title="No budgets set"
        description="Set a total or per-category limit and track spent, remaining and pace. A budget is a target, not money set aside."
      />
    </>
  );
}
