"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import { Check, Pencil, Plus } from "lucide-react";

import { CATEGORY_ICONS, CategoryBadge } from "@/components/categories/category-icon";
import { ActionForm, Field, FormMessage, SubmitButton } from "@/components/forms/form-parts";
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
import type { CategoryKind } from "@/domain";
import { createCategory, updateCategory } from "@/lib/actions/categories";
import { CATEGORY_COLORS, CATEGORY_ICON_NAMES, DEFAULT_CATEGORY_ICON } from "@/lib/category-style";
import { cn } from "@/lib/utils";

export type EditableCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
};

const SWATCH =
  "relative flex size-10 items-center justify-center rounded-xl border outline-none transition-[box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:ring-2 data-[state=checked]:ring-primary";

/** Create or edit a category/subcategory: name, icon and colour. */
export function CategoryFormDialog({
  category,
  kind,
  parent,
  trigger,
}: {
  category?: EditableCategory;
  kind: CategoryKind;
  /** Creating/editing a subcategory of this category (it inherits icon/colour when unset). */
  parent?: EditableCategory;
  trigger?: React.ReactNode;
}) {
  const editing = Boolean(category);
  const { open, setOpen, state, formAction, pending, formKey } = useDialogAction(
    editing ? updateCategory : createCategory,
  );
  const isSub = Boolean(parent);
  // "none" = inherit the parent's icon/colour (Radix radio values can't be empty strings).
  const unset = isSub ? "none" : "";
  const [icon, setIcon] = React.useState(category?.icon ?? unset);
  const [color, setColor] = React.useState(category?.color ?? unset);
  const err = state.fieldErrors ?? {};
  const prefix = `category-${category?.id ?? parent?.id ?? kind}-${editing ? "edit" : "new"}`;
  const what = isSub ? "subcategory" : "category";

  const onOpenChange = (next: boolean) => {
    if (next) {
      setIcon(category?.icon ?? unset);
      setColor(category?.color ?? unset);
    }
    setOpen(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ??
          (editing ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${category!.name}`}>
              <Pencil aria-hidden="true" />
            </Button>
          ) : (
            <Button variant="outline" size="sm">
              <Plus aria-hidden="true" />
              {isSub ? "Add subcategory" : "Add category"}
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Edit ${category!.name}`
              : isSub
                ? `New subcategory in ${parent!.name}`
                : `New ${kind === "income" ? "income" : "spending"} category`}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Renaming is safe: past entries keep pointing at this category and show the new name."
              : isSub
                ? "Subcategories split a category further, like Tea and Coffee under Food & Drinks."
                : "Choose a name, an icon and a colour you’ll recognise at a glance."}
          </DialogDescription>
        </DialogHeader>
        <ActionForm key={formKey} action={formAction} className="flex flex-col gap-5">
          {category && <input type="hidden" name="id" value={category.id} />}
          <input type="hidden" name="kind" value={kind} />
          {parent && <input type="hidden" name="parentId" value={parent.id} />}
          <FormMessage state={state} />
          <div className="flex items-end gap-3">
            <CategoryBadge
              icon={(icon !== "none" && icon) || parent?.icon || DEFAULT_CATEGORY_ICON}
              color={(color !== "none" && color) || parent?.color}
            />
            <Field
              id={`${prefix}-name`}
              name="name"
              label="Name"
              defaultValue={category?.name ?? ""}
              maxLength={40}
              autoComplete="off"
              required
              error={err.name}
              className="flex-1"
            />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Icon</legend>
            <RadioGroup.Root
              name="icon"
              value={icon}
              onValueChange={setIcon}
              aria-label="Icon"
              className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2"
            >
              {isSub && (
                <RadioGroup.Item
                  value="none"
                  className={cn(SWATCH, "text-xs text-muted-foreground")}
                  aria-label="Same as category"
                >
                  Same
                </RadioGroup.Item>
              )}
              {CATEGORY_ICON_NAMES.map((name) => {
                const Icon = CATEGORY_ICONS[name];
                return (
                  <RadioGroup.Item
                    key={name}
                    value={name}
                    className={SWATCH}
                    aria-label={name.replace(/-/g, " ")}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </RadioGroup.Item>
                );
              })}
            </RadioGroup.Root>
            {err.icon && <p className="text-sm text-destructive">{err.icon}</p>}
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Colour</legend>
            <RadioGroup.Root
              name="color"
              value={color}
              onValueChange={setColor}
              aria-label="Colour"
              className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2"
            >
              {isSub && (
                <RadioGroup.Item
                  value="none"
                  className={cn(SWATCH, "text-xs text-muted-foreground")}
                  aria-label="Same as category"
                >
                  Same
                </RadioGroup.Item>
              )}
              {CATEGORY_COLORS.map(({ value, name }) => (
                <RadioGroup.Item
                  key={value}
                  value={value}
                  aria-label={name}
                  className={SWATCH}
                  style={{ backgroundColor: value }}
                >
                  <RadioGroup.Indicator>
                    <Check className="size-4 text-white drop-shadow" aria-hidden="true" />
                  </RadioGroup.Indicator>
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
            {err.color && <p className="text-sm text-destructive">{err.color}</p>}
          </fieldset>

          <SubmitButton pending={pending} pendingLabel="Saving…" size="default">
            {editing ? "Save changes" : `Add ${what}`}
          </SubmitButton>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
