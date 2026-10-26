/** Category, merge, rule and queue-assignment schemas. */
import { z } from "zod";

import { CATEGORY_KINDS, RULE_FIELDS, normalizeText } from "@/domain";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";

const optionalUuid = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid().nullable());

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(40, "Use at most 40 characters."),
  kind: z.enum(CATEGORY_KINDS),
  parentId: optionalUuid,
  // "" or "none" = no icon of its own (a subcategory then shows its parent's).
  icon: z
    .string()
    .transform((v) => (v === "" || v === "none" ? null : v))
    .pipe(z.enum(CATEGORY_ICON_NAMES, "Choose an icon from the list.").nullable()),
  color: z
    .string()
    .transform((v) => (v === "" || v === "none" ? null : v))
    .pipe(
      z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #8B5CF6.")
        .nullable(),
    ),
});

export const mergeSchema = z
  .object({ sourceId: z.uuid(), targetId: z.uuid("Choose where to merge it.") })
  .refine((v) => v.sourceId !== v.targetId, {
    path: ["targetId"],
    message: "Choose a different category.",
  });

export const reorderSchema = z.object({
  id: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const ruleFormSchema = z.object({
  matchText: z
    .string()
    .trim()
    .min(1, "Enter a word or phrase to look for.")
    .max(80, "Use at most 80 characters.")
    .refine((v) => normalizeText(v) !== "", "Use at least one letter — numbers alone can’t match."),
  matchField: z.enum(RULE_FIELDS),
  categoryId: z.uuid("Choose a category."),
  subcategoryId: optionalUuid,
  priority: z.coerce.number().int().min(-100).max(100).default(0),
});

export const assignCategorySchema = z.object({
  transactionId: z.uuid(),
  version: z.coerce.number().int().positive(),
  categoryId: z.uuid("Choose a category."),
  subcategoryId: optionalUuid,
});
