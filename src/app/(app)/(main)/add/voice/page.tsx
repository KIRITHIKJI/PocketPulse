import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { VoiceEntry } from "@/components/transactions/voice-entry";
import { loadEntryKit } from "@/lib/data/entry-kit";

export const metadata: Metadata = { title: "Say it" };

export default async function VoiceEntryPage() {
  const kit = await loadEntryKit();
  return (
    <>
      <PageHeader
        title="Say it"
        description="Speak your expenses, fix the transcript if needed, then confirm the drafts. Nothing is saved until you do."
      />
      <SectionTabs section="record" />
      <VoiceEntry kit={kit} />
    </>
  );
}
