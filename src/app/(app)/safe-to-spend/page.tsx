import type { Metadata } from "next";
import { Gauge } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Safe to spend" };

export default function SafeToSpendPage() {
  return (
    <>
      <PageHeader
        title="Safe to spend"
        description="What’s reasonably free to spend before your next income, with every input and assumption shown."
      />
      <SectionTabs section="plan" />
      <StatePanel
        icon={Gauge}
        title="Nothing to calculate yet"
        description="Safe-to-spend needs your tracked balance and, for a daily limit, your next expected income date. We won’t guess either."
      />
    </>
  );
}
