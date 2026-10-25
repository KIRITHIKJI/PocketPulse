import type { Metadata } from "next";
import { Droplets } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Money leaks" };

export default function MoneyLeaksPage() {
  return (
    <>
      <PageHeader
        title="Money leaks"
        description="Repeated small purchases grouped together, so you can decide what’s worth it. No judgement."
      />
      <SectionTabs section="insights" />
      <StatePanel
        icon={Droplets}
        title="No repeated purchases found"
        description="When the same kind of small purchase repeats, you’ll see how often, how much in total, and a what-if estimate."
      />
    </>
  );
}
