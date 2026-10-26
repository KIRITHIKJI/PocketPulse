"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dbErrorMessage } from "@/lib/data/errors";
import { ensureDefaultAccount } from "@/lib/data/queries";
import { requireSession } from "@/lib/data/session";
import { type FormState, flag, indexedRows, invalid, text } from "@/lib/forms";
import { onboardingRedirect } from "@/lib/onboarding-routes";
import { balancesStepSchema, budgetsStepSchema, goalStepSchema } from "@/lib/validation/onboarding";
import { REMINDER_KEYS, privacySchema, remindersSchema } from "@/lib/validation/settings";

function continueTo(formData: FormData): never {
  revalidatePath("/", "layout");
  redirect(onboardingRedirect(formData.get("next")) ?? "/home");
}

/** Opening balance + effective date for the default wallet, plus optional extra wallets. */
export async function saveBalancesStep(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = balancesStepSchema.safeParse({
    openingDate: text(formData, "openingDate"),
    cashName: text(formData, "cashName"),
    cashBalance: text(formData, "cashBalance"),
    extras: indexedRows(formData, "extras")
      // Rows left completely blank are ignored rather than rejected.
      .filter((row) => (row.name ?? "").trim() !== "" || (row.balance ?? "").trim() !== "")
      .map((row) => ({
        id: row.id ?? "",
        name: row.name ?? "",
        kind: row.kind ?? "",
        balance: row.balance ?? "",
      })),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("save_opening_balances", {
    p_opening_date: parsed.data.openingDate,
    p_default_paise: parsed.data.cashBalance,
    p_default_name: parsed.data.cashName,
    p_extra: parsed.data.extras.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      opening_balance_paise: e.balance,
    })),
  });
  if (error) {
    return {
      status: "error",
      message: dbErrorMessage(error, "Each wallet needs a different name."),
    };
  }
  continueTo(formData);
}

export async function saveBudgetsStep(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = budgetsStepSchema.safeParse({
    total: text(formData, "total"),
    categories: indexedRows(formData, "budget").map((row) => ({
      categoryId: row.categoryId ?? "",
      amount: row.amount ?? "",
    })),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("set_monthly_budgets", {
    p_items: [
      { category_id: null, limit_paise: parsed.data.total },
      ...parsed.data.categories.map((c) => ({ category_id: c.categoryId, limit_paise: c.amount })),
    ],
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  continueTo(formData);
}

export async function saveGoalStep(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = goalStepSchema.safeParse({
    goalId: text(formData, "goalId"),
    title: text(formData, "title"),
    target: text(formData, "target"),
    targetDate: text(formData, "targetDate"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("currency").maybeSingle();
  // The client-generated id makes a resubmitted step update the same goal, never add another.
  const { error } = await supabase.from("savings_goals").upsert(
    {
      id: parsed.data.goalId,
      title: parsed.data.title,
      target_paise: parsed.data.target,
      target_date: parsed.data.targetDate,
      currency: profile?.currency ?? "INR",
    },
    { onConflict: "id" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error) };
  continueTo(formData);
}

/** Reminders + privacy (theme and motion save instantly from their controls). */
export async function savePreferencesStep(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const reminders = remindersSchema.safeParse({
    allDisabled: flag(formData, "allDisabled"),
    ...Object.fromEntries(REMINDER_KEYS.map((key) => [key, flag(formData, key)])),
  });
  const privacy = privacySchema.safeParse({
    includeNotesInReports: flag(formData, "includeNotesInReports"),
  });
  if (!reminders.success) return invalid(reminders.error);
  if (!privacy.success) return invalid(privacy.error);
  const { supabase, userId } = await requireSession();
  const r = reminders.data;
  const [prefs, profile] = await Promise.all([
    supabase
      .from("notification_preferences")
      .update({
        all_disabled: r.allDisabled,
        missed_logging: r.missedLogging,
        weekly_review: r.weeklyReview,
        upcoming_income: r.upcomingIncome,
        budget_alerts: r.budgetAlerts,
        upcoming_commitments: r.upcomingCommitments,
        savings_review: r.savingsReview,
      })
      .eq("owner_id", userId),
    supabase
      .from("profiles")
      .update({ include_notes_in_reports: privacy.data.includeNotesInReports })
      .eq("id", userId),
  ]);
  const error = prefs.error ?? profile.error;
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finishOnboarding();
}

/**
 * Ends onboarding (also "Skip setup"): makes sure the default Cash wallet exists, so every entry
 * form has an account to preselect, and marks setup complete. Everything stays editable later.
 */
export async function finishOnboarding(): Promise<never> {
  const session = await requireSession();
  await ensureDefaultAccount(session);
  await session.supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", session.userId)
    .is("onboarding_completed_at", null);
  revalidatePath("/", "layout");
  redirect("/home");
}
