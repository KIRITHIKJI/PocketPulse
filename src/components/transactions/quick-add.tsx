"use client";

import * as React from "react";
import { History, Repeat2 } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { EntryKit } from "@/lib/data/entry-kit";
import type { QuickEntry, QuickShortcut } from "@/lib/quick-entries";
import { cn } from "@/lib/utils";
import { money, OtherEntryRoutes, QuickAddForm } from "@/components/transactions/quick-add-form";

/** Tiles + "repeat last" + frequent shortcuts, and the sheet that confirms the amount. */
export function QuickAdd({
  kit,
  tiles,
  shortcuts,
  compact = false,
}: {
  kit: EntryKit;
  tiles: QuickEntry[];
  shortcuts: QuickShortcut[];
  /** Home: a single scrolling row instead of the full grid. */
  compact?: boolean;
}) {
  const [active, setActive] = React.useState<QuickEntry | null>(null);
  const [openCount, setOpenCount] = React.useState(0);
  const open = (entry: QuickEntry) => {
    setOpenCount((n) => n + 1);
    setActive(entry);
  };

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Quick-add tiles"
        className={cn(
          compact
            ? "-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
            : "grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6",
        )}
      >
        {tiles.map((tile) => (
          <li key={tile.key} className={cn(compact && "w-24 shrink-0 snap-start")}>
            <button
              type="button"
              onClick={() => open(tile)}
              className="flex h-full min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-center transition-[background-color,transform] outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97]"
            >
              <CategoryBadge icon={tile.icon} color={tile.color} size="sm" />
              <span className="line-clamp-1 text-sm font-medium">{tile.title}</span>
              <span className="tabular text-xs text-muted-foreground">
                {tile.amountPaise !== null ? money(tile.amountPaise, kit) : "Any amount"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* The full Quick add screen already has these as tabs. */}
      {compact && <OtherEntryRoutes />}

      {shortcuts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Log again
          </h3>
          <ul className="flex flex-wrap gap-2">
            {shortcuts.map(({ kind, count, entry }) => (
              <li key={`${kind}-${entry.key}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-10 rounded-full py-1.5"
                  onClick={() => open(entry)}
                  aria-label={`${kind === "repeat" ? "Repeat last expense" : "Log again"}: ${entry.title}, ${money(entry.amountPaise ?? 0, kit)}`}
                >
                  {kind === "repeat" ? (
                    <Repeat2 aria-hidden="true" />
                  ) : (
                    <History aria-hidden="true" />
                  )}
                  <span className="max-w-40 truncate">
                    {kind === "repeat" ? "Repeat " : ""}
                    {entry.title}
                  </span>
                  <span className="tabular text-muted-foreground">
                    {money(entry.amountPaise ?? 0, kit)}
                    {count ? ` · ${count}×` : ""}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={active !== null} onOpenChange={(next) => !next && setActive(null)}>
        <DialogContent>
          {active && (
            <QuickAddForm
              key={`${active.key}-${openCount}`}
              entry={active}
              kit={kit}
              onDone={() => setActive(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
