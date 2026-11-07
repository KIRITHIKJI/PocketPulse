"use client";

import * as React from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

type Cadence = "daily" | "weekly" | "once";

/**
 * Missions in three groups. Desktop shows all three columns; a phone shows one group at a time
 * under a segmented control, so nothing is pushed below a long list.
 */
export function MissionsBoard({
  groups,
}: {
  groups: { cadence: Cadence; label: string; content: React.ReactNode }[];
}) {
  const [shown, setShown] = React.useState<Cadence>(groups[0]?.cadence ?? "daily");
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        aria-label="Mission group"
        className="grid grid-cols-3 lg:hidden"
        value={shown}
        onValueChange={setShown}
        options={groups.map((g) => ({ value: g.cadence, label: g.label }))}
      />
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start lg:gap-6">
        {groups.map((g) => (
          <div
            key={g.cadence}
            className={cn("min-w-0", g.cadence !== shown && "hidden lg:block")}
            data-testid={`missions-${g.cadence}`}
          >
            {g.content}
          </div>
        ))}
      </div>
    </div>
  );
}
