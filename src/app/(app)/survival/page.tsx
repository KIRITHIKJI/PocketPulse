import type { Metadata } from "next";
import { LifeBuoy } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Survival mode" };

export default function SurvivalPage() {
  return (
    <>
      <PageHeader
        title="Survival mode"
        description="Make your pocket money last until the next allowance with a daily plan and early warnings."
      />
      <SectionTabs section="plan" />
      <StatePanel
        icon={LifeBuoy}
        title="No allowance plan yet"
        description="Add your allowance amount and next expected date to get a daily and weekly spending plan."
      />
    </>
  );
}
