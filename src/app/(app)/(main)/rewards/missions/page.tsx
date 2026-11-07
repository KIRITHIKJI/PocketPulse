import type { Metadata } from "next";
import { ListChecks } from "lucide-react";

import { MissionsBoard } from "@/components/rewards/missions-board";
import { ProgressHeader, ProgressUnavailable } from "@/components/rewards/progress-page";
import { MissionRow } from "@/components/rewards/progress-parts";
import { StatePanel } from "@/components/states/state-panel";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { MISSION_GROUPS } from "@/domain";
import { loadProgress } from "@/lib/rewards/view";

export const metadata: Metadata = { title: "Missions" };

/**
 * Missions (doc/DESIGN_PLAN.md §4): daily, weekly and long-term, each a step of the main job.
 * All optional: Skip costs nothing, and Bring back undoes it.
 */
export default async function MissionsPage() {
  const view = await loadProgress();
  const header = (
    <ProgressHeader
      title="Missions"
      description="Small, optional steps: log, look, sort, set aside. None asks you to spend or save an amount."
      view={view}
    />
  );
  if (!view) {
    return (
      <>
        {header}
        <ProgressUnavailable />
      </>
    );
  }
  if (view.missions.length === 0) {
    return (
      <>
        {header}
        <StatePanel
          icon={ListChecks}
          title="No missions right now"
          description="Missions appear here once they’re available. Logging still earns XP for each day you log."
        />
      </>
    );
  }

  const groups = MISSION_GROUPS.map((group) => {
    const missions = view.missions.filter((m) => m.cadence === group.cadence);
    const open = missions.filter((m) => !m.skipped);
    return {
      cadence: group.cadence,
      label: group.label,
      content: (
        <Surface>
          <SurfaceHeader
            title={group.label}
            meta={`${open.filter((m) => m.complete).length} of ${open.length} done · ${group.resets}`}
          />
          {missions.length > 0 && open.length === 0 && (
            <StatePanel
              size="section"
              title="All skipped. That’s fine."
              description="Bring one back below whenever you like."
            />
          )}
          {missions.length === 0 ? (
            <StatePanel size="section" title="Nothing here yet" />
          ) : (
            <ul className="-my-3 flex flex-col divide-y">
              {missions.map((m) => (
                <MissionRow key={m.code} mission={m} />
              ))}
            </ul>
          )}
        </Surface>
      ),
    };
  });

  return (
    <>
      {header}
      <MissionsBoard groups={groups} />
    </>
  );
}
