"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import { presetFormSchema } from "@/lib/validation/presets";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

/** Creates a quick-add tile or edits one (label, usual amount, default category, icon). */
export async function savePreset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = presetFormSchema.safeParse({
    id: text(formData, "id"),
    label: text(formData, "label"),
    amount: text(formData, "amount"),
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
    icon: text(formData, "icon"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const values = {
    label: parsed.data.label,
    amount_paise: parsed.data.amount,
    category_id: parsed.data.categoryId,
    subcategory_id: parsed.data.subcategoryId,
    icon: parsed.data.icon,
  };

  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("quick_add_presets")
      .update(values)
      .eq("id", parsed.data.id)
      .select("id");
    if (error) return { status: "error", message: dbErrorMessage(error) };
    if (!data?.length) return { status: "error", message: "That tile doesn’t exist any more." };
    return done(`Saved the ${parsed.data.label} tile.`);
  }

  const { data: last } = await supabase
    .from("quick_add_presets")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase
    .from("quick_add_presets")
    .insert({ ...values, sort_order: Number(last?.sort_order ?? -1) + 1 });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done(`Added the ${parsed.data.label} tile.`);
}

/** Hides a tile (archive) or brings it back. Entries already logged with it are untouched. */
export async function setPresetArchived(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = text(formData, "id");
  const archive = text(formData, "archive") === "true";
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("quick_add_presets")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .select("label");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data?.length) return { status: "error", message: "That tile doesn’t exist any more." };
  return done(archive ? `Hid the ${data[0]!.label} tile.` : `Restored the ${data[0]!.label} tile.`);
}
