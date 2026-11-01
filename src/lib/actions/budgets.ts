"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dbErrorMessage } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import { budgetFormSchema } from "@/lib/validation/plan";

const DUPLICATE = "You already have a budget for that category and period. Edit that one instead.";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

/** Creates or edits a budget. The id comes from the form, so a double submit saves one budget. */
export async function saveBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = budgetFormSchema.safeParse({
    id: text(formData, "id"),
    categoryId: text(formData, "categoryId"),
    limit: text(formData, "limit"),
    period: text(formData, "period"),
    customFrom: text(formData, "customFrom"),
    customTo: text(formData, "customTo"),
    thresholds: text(formData, "thresholds"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("currency").maybeSingle();
  const b = parsed.data;
  const custom = b.period === "custom";
  const { error } = await supabase.from("budgets").upsert(
    {
      id: b.id,
      category_id: b.categoryId,
      limit_paise: b.limit,
      currency: profile?.currency ?? "INR",
      period: b.period,
      custom_from: custom ? b.customFrom : null,
      custom_to: custom ? b.customTo : null,
      alert_thresholds_bp: b.thresholds,
    },
    { onConflict: "id" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error, DUPLICATE) };
  return done("Budget saved.");
}

/** Budgets are read from the ledger, so removing one changes no money and no entry. */
export async function archiveBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: "That budget doesn’t exist any more." };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("budgets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data?.length) return { status: "error", message: "That budget doesn’t exist any more." };
  return done("Budget removed.");
}
