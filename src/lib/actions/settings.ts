"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { dbErrorMessage } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";
import { type FormState, flag, invalid, text } from "@/lib/forms";
import { onboardingRedirect } from "@/lib/onboarding-routes";
import {
  REMINDER_KEYS,
  appearanceSchema,
  incomeSchema,
  privacySchema,
  profileNameSchema,
  regionSchema,
  remindersSchema,
  spendingSchema,
} from "@/lib/validation/settings";

const SAVED: FormState = { status: "success", message: "Saved." };
const saved = (): FormState => ({ ...SAVED, savedAt: Date.now() });

/**
 * Settings and onboarding share these actions. A form may carry a `next` onboarding step; after
 * a successful save the user continues there (validated against the known steps).
 */
function finish(formData: FormData): FormState {
  revalidatePath("/", "layout");
  const next = onboardingRedirect(formData.get("next"));
  if (next) redirect(next);
  return saved();
}

async function updateProfile(patch: Record<string, unknown>) {
  const { supabase, userId } = await requireSession();
  return supabase.from("profiles").update(patch).eq("id", userId);
}

export async function saveProfileName(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = profileNameSchema.safeParse({ displayName: text(formData, "displayName") });
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await updateProfile({ display_name: parsed.data.displayName });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}

/** Called from theme/motion controls (not a form): keeps the choice in sync across devices. */
export async function saveAppearance(input: unknown): Promise<{ ok: boolean }> {
  const parsed = appearanceSchema.partial().safeParse(input);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return { ok: false };
  const { error } = await updateProfile(parsed.data);
  return { ok: !error };
}

export async function saveRegion(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = regionSchema.safeParse({
    currency: text(formData, "currency"),
    timeZone: text(formData, "timeZone"),
    weekStartsOn: text(formData, "weekStartsOn") || "1",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, userId } = await requireSession();

  const { data: current } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", userId)
    .maybeSingle();
  if (current && current.currency !== parsed.data.currency) {
    const { error } = await supabase.rpc("change_currency", { p_currency: parsed.data.currency });
    if (error) {
      return {
        status: "error",
        message: dbErrorMessage(error),
        fieldErrors: { currency: dbErrorMessage(error) },
      };
    }
  }
  const { error } = await updateProfile({
    time_zone: parsed.data.timeZone,
    week_starts_on: parsed.data.weekStartsOn,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}

export async function saveIncome(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = incomeSchema.safeParse({
    incomeFrequency: text(formData, "incomeFrequency"),
    nextIncomeDate: text(formData, "nextIncomeDate"),
    expectedIncome: text(formData, "expectedIncome"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await updateProfile({
    income_frequency: parsed.data.incomeFrequency,
    next_income_date: parsed.data.nextIncomeDate,
    expected_income_paise: parsed.data.expectedIncome,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}

export async function saveSpending(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = spendingSchema.safeParse({
    smallPurchaseThreshold: text(formData, "smallPurchaseThreshold"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await updateProfile({
    small_purchase_threshold_paise: parsed.data.smallPurchaseThreshold,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}

const REMINDER_COLUMNS = {
  missedLogging: "missed_logging",
  weeklyReview: "weekly_review",
  upcomingIncome: "upcoming_income",
  budgetAlerts: "budget_alerts",
  upcomingCommitments: "upcoming_commitments",
  savingsReview: "savings_review",
} as const;

export async function saveReminders(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = remindersSchema.safeParse({
    allDisabled: flag(formData, "allDisabled"),
    ...Object.fromEntries(REMINDER_KEYS.map((key) => [key, flag(formData, key)])),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, userId } = await requireSession();
  const patch: Record<string, boolean> = { all_disabled: parsed.data.allDisabled };
  for (const key of REMINDER_KEYS) patch[REMINDER_COLUMNS[key]] = parsed.data[key];
  const { error } = await supabase
    .from("notification_preferences")
    .update(patch)
    .eq("owner_id", userId);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}

export async function savePrivacy(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = privacySchema.safeParse({
    includeNotesInReports: flag(formData, "includeNotesInReports"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await updateProfile({
    include_notes_in_reports: parsed.data.includeNotesInReports,
  });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return finish(formData);
}
