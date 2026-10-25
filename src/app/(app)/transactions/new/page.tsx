import type { Metadata } from "next";
import { SquarePen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Full form" };

export default function NewTransactionPage() {
  return (
    <>
      <PageHeader
        title="Full form"
        description="Amount and category are all you need. Date, account, merchant, notes and tags are optional."
      />
      <SectionTabs section="record" />
      <StatePanel
        icon={SquarePen}
        title="No accounts to record against"
        description="Your tracked accounts and categories appear here once your profile is set up during onboarding."
      />
    </>
  );
}
