"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  RotateCcw,
} from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { CategoryPicker, type PickerNode } from "@/components/categories/category-picker";
import { useToast } from "@/components/feedback/toast";
import {
  ActionForm,
  Field,
  FormMessage,
  MoneyField,
  SelectField,
  SubmitButton,
} from "@/components/forms/form-parts";
import { InlineAction } from "@/components/forms/inline-action";
import { useDialogAction } from "@/components/forms/use-dialog-action";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { reorderPresets, savePreset, setPresetArchived } from "@/lib/actions/presets";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";
import { paiseToInput } from "@/lib/format";
import { dropIndex, moveItem } from "@/lib/reorder";
import { cn } from "@/lib/utils";

type EditableTile = {
  id: string;
  label: string;
  /** Shown on the tile (its own icon, else the category's). */
  icon: string | null;
  /** The icon chosen for the tile itself; null = use the category's. */
  ownIcon: string | null;
  color: string | null;
  amountLabel: string | null;
  amountPaise: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  categoryLabel: string | null;
  archived: boolean;
};

function TileFormDialog({ tile, tree }: { tile?: EditableTile; tree: PickerNode[] }) {
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(savePreset);
  const err = state.fieldErrors ?? {};
  const prefix = tile ? `tile-${tile.id}` : "tile-new";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {tile ? (
          <Button variant="ghost" size="sm" aria-label={`Edit the ${tile.label} tile`}>
            <Pencil aria-hidden="true" />
            <span className="max-sm:sr-only">Edit</span>
          </Button>
        ) : (
          <Button variant="outline">
            <Plus aria-hidden="true" />
            Add tile
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tile ? `Edit ${tile.label}` : "Add a quick-add tile"}</DialogTitle>
          <DialogDescription>
            With a usual amount and a category, one tap on the tile saves it. Its pencil button lets
            you enter a different amount any time.
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-4">
          {tile && <input type="hidden" name="id" value={tile.id} />}
          <FormMessage state={state} />
          <Field
            id={`${prefix}-label`}
            name="label"
            label="Name"
            defaultValue={tile?.label ?? ""}
            maxLength={30}
            autoComplete="off"
            required
            error={err.label}
          />
          <MoneyField
            id={`${prefix}-amount`}
            name="amount"
            label="Usual amount"
            defaultValue={paiseToInput(tile?.amountPaise ?? null)}
            hint="Leave blank to type the amount each time."
            error={err.amount}
          />
          <CategoryPicker
            id={`${prefix}-category`}
            label="Category"
            tree={tree}
            defaultCategoryId={tile?.categoryId ?? null}
            defaultSubcategoryId={tile?.subcategoryId ?? null}
            placeholder="Ask each time"
            hint="Without a category the tile asks what it was and suggests one."
            error={err.categoryId ?? err.subcategoryId}
          />
          <SelectField
            id={`${prefix}-icon`}
            name="icon"
            label="Icon"
            defaultValue={tile?.ownIcon ?? ""}
            error={err.icon}
          >
            <option value="">Use the category’s icon</option>
            {CATEGORY_ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name.replaceAll("-", " ")}
              </option>
            ))}
          </SelectField>
          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {tile ? "Save tile" : "Add tile"}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

const middlesOf = (list: HTMLUListElement | null) =>
  ([...(list?.children ?? [])] as HTMLElement[]).map((row) => {
    const box = row.getBoundingClientRect();
    return box.top + box.height / 2;
  });

/**
 * The visible tiles' order, changed by dragging the grip or with the Move up / Move down buttons.
 * The new order shows at once and is saved in the background; saves run one after another, so
 * the last order always wins. If a save fails, the order goes back to what's stored.
 */
function useTileOrder(visible: EditableTile[]) {
  const { show } = useToast();
  const stored = visible.map((t) => t.id).join();
  const [order, setOrder] = React.useState(() => visible.map((t) => t.id));
  const [announcement, setAnnouncement] = React.useState("");
  const saving = React.useRef<Promise<unknown>>(Promise.resolve());

  // The server's order (after a save, an added tile, or a hidden one) replaces the local one.
  const [seen, setSeen] = React.useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setOrder(visible.map((t) => t.id));
  }

  const save = (next: string[]) => {
    saving.current = saving.current.then(async () => {
      const result = await reorderPresets(next).catch(() => ({
        ok: false,
        message: "Couldn’t save the new order. Check your connection.",
      }));
      if (!result.ok) {
        setOrder(stored.split(","));
        show({ tone: "error", message: result.message ?? "Couldn’t save the new order." });
      }
    });
  };

  const move = (from: number, to: number, persist = true) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = moveItem(order, from, to);
    setOrder(next);
    const label = visible.find((t) => t.id === order[from])?.label ?? "Tile";
    setAnnouncement(`${label} moved to position ${to + 1} of ${order.length}.`);
    if (persist) save(next);
  };

  const byId = new Map(visible.map((t) => [t.id, t]));
  return {
    tiles: order.flatMap((id) => byId.get(id) ?? []),
    move,
    saveOrder: () => save(order),
    announcement,
  };
}

/** Customise tiles: usual amounts, default categories, icons; reorder, hide and restore. */
export function TileEditor({ tiles, tree }: { tiles: EditableTile[]; tree: PickerNode[] }) {
  const hidden = tiles.filter((t) => t.archived);
  const {
    tiles: visible,
    move,
    saveOrder,
    announcement,
  } = useTileOrder(tiles.filter((t) => !t.archived));
  const listRef = React.useRef<HTMLUListElement>(null);
  const drag = React.useRef<{ id: string; middles: number[]; moved: boolean } | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, id: string) {
    drag.current = { id, middles: middlesOf(listRef.current), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(id);
  }
  function moveDrag(event: React.PointerEvent) {
    const current = drag.current;
    if (!current) return;
    const from = visible.findIndex((t) => t.id === current.id);
    const to = dropIndex(current.middles, from, event.clientY);
    if (to === from) return;
    move(from, to, false);
    current.moved = true;
    // Measure again once the rows have moved, so the next step compares against the screen.
    requestAnimationFrame(() => {
      current.middles = middlesOf(listRef.current);
    });
  }
  function endDrag() {
    if (drag.current?.moved) saveOrder();
    drag.current = null;
    setDragging(null);
  }

  const row = (tile: EditableTile, index?: number) => (
    <li
      key={tile.id}
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5",
        dragging === tile.id &&
          "relative z-10 rounded-xl bg-surface-2 shadow-(--surface-raised-shadow)",
      )}
      data-testid={`tile-${tile.label}`}
    >
      {index !== undefined && (
        <button
          type="button"
          aria-label={`Drag to reorder ${tile.label}`}
          title="Drag to reorder"
          onPointerDown={(e) => startDrag(e, tile.id)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
      )}
      <CategoryBadge icon={tile.icon} color={tile.color} size="sm" />
      <div className="min-w-36 flex-1">
        <p className="truncate font-medium">{tile.label}</p>
        <p className="truncate text-xs text-muted-foreground money">
          {tile.amountLabel ?? "No usual amount"} · {tile.categoryLabel ?? "Asks for a category"}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center justify-end gap-1">
        {index !== undefined && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${tile.label} up`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              <ChevronUp aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${tile.label} down`}
              disabled={index === visible.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <ChevronDown aria-hidden="true" />
            </Button>
          </>
        )}
        {!tile.archived && <TileFormDialog tile={tile} tree={tree} />}
        <InlineAction
          action={setPresetArchived}
          fields={{ id: tile.id, archive: tile.archived ? "false" : "true" }}
          pendingLabel="Saving…"
          aria-label={tile.archived ? `Show the ${tile.label} tile` : `Hide the ${tile.label} tile`}
        >
          {tile.archived ? <RotateCcw aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          <span className="max-sm:sr-only">{tile.archived ? "Show" : "Hide"}</span>
        </InlineAction>
      </div>
    </li>
  );
  return (
    <div className="flex flex-col gap-3">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <ul ref={listRef} aria-label="Your tiles, in order" className="divide-y">
        {visible.map((tile, index) => row(tile, index))}
      </ul>
      <div>
        <TileFormDialog tree={tree} />
      </div>
      {hidden.length > 0 && (
        <section aria-labelledby="hidden-tiles" className="flex flex-col gap-1">
          <h3 id="hidden-tiles" className="text-sm font-semibold">
            Hidden tiles
          </h3>
          <ul className="divide-y">{hidden.map((tile) => row(tile))}</ul>
        </section>
      )}
    </div>
  );
}
