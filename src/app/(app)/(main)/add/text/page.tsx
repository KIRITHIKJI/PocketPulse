import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { TextEntry } from "@/components/transactions/text-entry";
import { loadEntryKit } from "@/lib/data/entry-kit";

export const metadata: Metadata = { title: "Type it" };

export default async function TextEntryPage() {
  const kit = await loadEntryKit();
  return (
    <>
      <PageHeader
        title="Type it"
        description="Write “tea 15, bus 20, snacks 35” and review each draft before anything is saved."
      />
      <SectionTabs section="record" />
      <TextEntry kit={kit} />
    </>
  );
}
