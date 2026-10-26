import type { Metadata } from "next";
import { Mic } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Say it" };

export default function VoiceEntryPage() {
  return (
    <>
      <PageHeader
        title="Say it"
        description="Speak your expenses, edit the transcript, then confirm the drafts. Audio never leaves your device."
      />
      <SectionTabs section="record" />
      <StatePanel
        icon={Mic}
        title="No transcript yet"
        description="Voice entry uses your browser’s speech recognition where available, and always offers typing as a fallback."
      />
    </>
  );
}
