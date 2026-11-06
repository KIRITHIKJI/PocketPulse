"use client";

import * as React from "react";
import { Check, History, LoaderCircle, Pencil, Repeat2 } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { EntryKit } from "@/lib/data/entry-kit";
import { newId } from "@/lib/ids";
import {
  type QuickEntry,
  type QuickShortcut,
  type TapIds,
  idsForTap,
  savesInOneTap,
} from "@/lib/quick-entries";
import { cn } from "@/lib/utils";
import {
  money,
  OtherEntryRoutes,
  QuickAddForm,
  quickEntryCommand,
} from "@/components/transactions/quick-add-form";

/** A one-tap save stays undoable this long (the sheet's saves keep the usual 8 s). */
const ONE_TAP_UNDO_MS = 5_000;
/** How long a tile shows its check after a save. */
const SAVED_MS = 900;

type TileState = "idle" | "saving" | "saved";

/**
 * Tiles + "log again" shortcuts, and the sheet that confirms an amount. A tile with a usual amount
 * and a category saves in one tap; its pencil button (or a tile without an amount) opens the sheet.
 */
export function QuickAdd({
  kit,
  tiles,
  shortcuts,
  showRoutes = false,
}: {
  kit: EntryKit;
  tiles: QuickEntry[];
  shortcuts: QuickShortcut[];
  /** Home: also link to Type it and Say it (Quick add has them as tabs). */
  showRoutes?: boolean;
}) {
  const { run } = useLedger();
  const [active, setActive] = React.useState<QuickEntry | null>(null);
  const [openCount, setOpenCount] = React.useState(0);
  const [states, setStates] = React.useState<Record<string, TileState>>({});
  const taps = React.useRef(new Map<string, TapIds>());

  const open = (entry: QuickEntry) => {
    setOpenCount((n) => n + 1);
    setActive(entry);
  };
  const setState = (key: string, state: TileState) =>
    setStates((current) => ({ ...current, [key]: state }));

  async function tap(tile: QuickEntry) {
    if (!savesInOneTap(tile)) return open(tile);
    const ids = idsForTap(taps.current.get(tile.key) ?? null, newId);
    taps.current.set(tile.key, ids);
    setState(tile.key, "saving");
    const result = await run(
      quickEntryCommand(tile, kit, {
        ids,
        amountPaise: tile.amountPaise!,
        occurredAt: new Date(ids.at).toISOString(),
      }),
      {
        success: `Saved ${money(tile.amountPaise!, kit)} · ${tile.title}`,
        label: tile.title,
        routine: true,
        undoMs: ONE_TAP_UNDO_MS,
      },
    );
    // `null`: a second tap while the first is still sending. The first one reports.
    if (result === null) return;
    setState(tile.key, result.ok ? "saved" : "idle");
    if (result.ok) window.setTimeout(() => setState(tile.key, "idle"), SAVED_MS);
  }

  return (
    <div className="flex flex-col gap-4">
      <ul
        aria-label="Quick-add tiles"
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
      >
        {tiles.map((tile) => (
          <QuickTile
            key={tile.key}
            tile={tile}
            kit={kit}
            state={states[tile.key] ?? "idle"}
            onTap={() => void tap(tile)}
            onEdit={() => open(tile)}
          />
        ))}
      </ul>

      {showRoutes && <OtherEntryRoutes />}

      {shortcuts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="type-caption font-medium text-muted-foreground">Log again</h3>
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
                  <span className="money text-muted-foreground">
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

function QuickTile({
  tile,
  kit,
  state,
  onTap,
  onEdit,
}: {
  tile: QuickEntry;
  kit: EntryKit;
  state: TileState;
  onTap: () => void;
  onEdit: () => void;
}) {
  const ready = savesInOneTap(tile);
  const amount = tile.amountPaise !== null ? money(tile.amountPaise, kit) : null;
  const hint = tile.askDetails ? "Any item" : (amount ?? "Set amount");
  const label = ready
    ? `${tile.title}, ${amount}. Saves in one tap`
    : tile.askDetails
      ? `${tile.title}. Enter what it was`
      : `${tile.title}. Set the amount`;
  return (
    <li className="relative" data-state={state}>
      <button
        type="button"
        onClick={onTap}
        aria-label={label}
        aria-busy={state === "saving" || undefined}
        data-ready={ready || undefined}
        className={cn(
          "flex h-full min-h-22 w-full flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-2 py-3 text-center transition-[background-color,border-color,transform] duration-(--duration-quick) outline-none select-none hover:border-border-strong hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.97] active:duration-(--duration-instant)",
          state === "saved" && "border-feedback-success/50",
        )}
      >
        <span className="relative">
          <CategoryBadge icon={tile.icon} color={tile.color} size="sm" />
          {state === "saved" && (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center rounded-lg bg-feedback-success text-positive-foreground"
            >
              <Check className="size-4" />
            </span>
          )}
        </span>
        <span className="line-clamp-1 type-body font-medium">{tile.title}</span>
        <span
          className={cn(
            "flex items-center gap-1 type-caption money",
            ready ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {state === "saving" ? (
            <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
          ) : null}
          {hint}
        </span>
      </button>
      {/* The edit button: a small mark, with a 44 px tap area in the tile's corner. */}
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Change the amount for ${tile.title}`}
        className="group absolute top-0 right-0 flex size-11 items-start justify-end rounded-tr-xl p-1.5 outline-none"
      >
        <span className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50">
          <Pencil className="size-3" aria-hidden="true" />
        </span>
      </button>
    </li>
  );
}
