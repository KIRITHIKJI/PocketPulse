import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Type it" };

export default function TextEntryPage() {
  return (
    <>
      <PageHeader
        title="Type it"
        description="Write “tea 15, bus 20, snacks 35” and review each draft before anything is saved."
      />
      <SectionTabs section="record" />
      <StatePanel
        icon={MessageSquareText}
        title="Nothing to review"
        description="Parsed drafts appear here for you to check amount, category and date. Nothing is saved until you confirm."
      />
    </>
  );
}
