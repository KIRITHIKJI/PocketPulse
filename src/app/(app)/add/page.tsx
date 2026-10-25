import type { Metadata } from "next";
import { Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Quick add" };

export default function QuickAddPage() {
  return (
    <>
      <PageHeader
        title="Quick add"
        description="Tap a tile, confirm the amount, done. Built for ₹10 teas and ₹20 bus rides."
      />
      <SectionTabs section="record" />
      <StatePanel
        icon={Zap}
        title="No quick-add tiles yet"
        description="Tea, coffee, snacks, bus, recharge and your own custom tiles will live here, each with a saved typical amount and category."
      />
    </>
  );
}
