"use client";

import { EyeOff, Pencil, Plus, RotateCcw } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { CategoryPicker, type PickerNode } from "@/components/categories/category-picker";
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
import { savePreset, setPresetArchived } from "@/lib/actions/presets";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";
import { paiseToInput } from "@/lib/format";

export type EditableTile = {
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
            Edit
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
            A tile records an expense in two taps. Its usual amount is only a starting point — you
            can change it every time.
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

/** Customise tiles: usual amounts, default categories, icons; hide and restore. */
export function TileEditor({ tiles, tree }: { tiles: EditableTile[]; tree: PickerNode[] }) {
  const visible = tiles.filter((t) => !t.archived);
  const hidden = tiles.filter((t) => t.archived);
  const row = (tile: EditableTile) => (
    <li key={tile.id} className="flex items-center gap-3 py-2.5" data-testid={`tile-${tile.label}`}>
      <CategoryBadge icon={tile.icon} color={tile.color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{tile.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {tile.amountLabel ?? "Any amount"} · {tile.categoryLabel ?? "Asks for a category"}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-1">
        {!tile.archived && <TileFormDialog tile={tile} tree={tree} />}
        <InlineAction
          action={setPresetArchived}
          fields={{ id: tile.id, archive: tile.archived ? "false" : "true" }}
          pendingLabel="Saving…"
          aria-label={tile.archived ? `Show the ${tile.label} tile` : `Hide the ${tile.label} tile`}
        >
          {tile.archived ? <RotateCcw aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {tile.archived ? "Show" : "Hide"}
        </InlineAction>
      </div>
    </li>
  );
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y">{visible.map(row)}</ul>
      <div>
        <TileFormDialog tree={tree} />
      </div>
      {hidden.length > 0 && (
        <section aria-labelledby="hidden-tiles" className="flex flex-col gap-1">
          <h3 id="hidden-tiles" className="text-sm font-semibold">
            Hidden tiles
          </h3>
          <ul className="divide-y">{hidden.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
