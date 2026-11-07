import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { SaveEarnedRewards } from "@/components/rewards/save-earned-rewards";
import { StatePanel } from "@/components/states/state-panel";
import type { ProgressView } from "@/lib/rewards/view";

/** The header every progress screen shares, plus the deferred save of anything newly earned. */
export function ProgressHeader({
  title,
  description,
  view,
}: {
  title: string;
  description: string;
  view: ProgressView | null;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <SectionTabs section="progress" />
      {view?.plan.changed && <SaveEarnedRewards />}
    </>
  );
}

export function ProgressUnavailable() {
  return (
    <StatePanel
      variant="error"
      title="Your progress isn’t available right now"
      description="Your entries are safe. XP and missions catch up on their own the next time this loads."
    />
  );
}
