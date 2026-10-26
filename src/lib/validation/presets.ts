/** Quick-add tile form: label, usual amount (optional), default category and icon. */
import { z } from "zod";

import { optionalAmountField } from "@/lib/forms";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Choose an option from the list.").nullable());

export const presetFormSchema = z
  .object({
    id: optionalId,
    label: z.string().trim().min(1, "Give the tile a name.").max(30, "Use at most 30 characters."),
    amount: optionalAmountField,
    categoryId: optionalId,
    subcategoryId: optionalId,
    icon: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.enum(CATEGORY_ICON_NAMES, "Choose an icon from the list.").nullable()),
  })
  .transform((f) => ({ ...f, subcategoryId: f.categoryId ? f.subcategoryId : null }));
export type PresetForm = z.output<typeof presetFormSchema>;
