"use server";

import { revalidatePath } from "next/cache";

import type { GoalStatus } from "@/domain";
import { dbErrorMessage } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import { type GoalStatusAction, goalFormSchema, goalStatusSchema } from "@/lib/validation/plan";

const MISSING = "That goal doesn’t exist any more.";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

/** Creates or edits a goal. Its money lives in the ledger, so this touches no amounts. */
export async function saveGoal(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalFormSchema.safeParse({
    id: text(formData, "id"),
    title: text(formData, "title"),
    icon: text(formData, "icon"),
    target: text(formData, "target"),
    targetDate: text(formData, "targetDate"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("currency").maybeSingle();
  const { error } = await supabase.from("savings_goals").upsert(
    {
      id: parsed.data.id,
      title: parsed.data.title,
      icon: parsed.data.icon,
      target_paise: parsed.data.target,
      target_date: parsed.data.targetDate,
      currency: profile?.currency ?? "INR",
    },
    { onConflict: "id" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done(`Saved ${parsed.data.title}.`);
}

const NEXT_STATUS: Record<GoalStatusAction, GoalStatus> = {
  pause: "paused",
  resume: "active",
  complete: "completed",
  reopen: "active",
  archive: "archived",
};

const DONE_TEXT: Record<GoalStatusAction, string> = {
  pause: "Goal paused. Its money stays set aside.",
  resume: "Goal resumed.",
  complete: "Goal complete.",
  reopen: "Goal reopened.",
  archive: "Goal archived. Its history is kept.",
};

/** Pause, resume, complete, reopen or archive. No status change moves money or deletes history. */
export async function setGoalStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalStatusSchema.safeParse({
    id: text(formData, "id"),
    action: text(formData, "action"),
  });
  if (!parsed.success) return { status: "error", message: MISSING };
  const { id, action } = parsed.data;
  const status = NEXT_STATUS[action];
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("savings_goals")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data?.length) return { status: "error", message: MISSING };
  return done(DONE_TEXT[action]);
}
