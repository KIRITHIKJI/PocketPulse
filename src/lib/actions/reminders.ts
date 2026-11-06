"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { dueReminders, moneyFormatter } from "@/domain";
import { dbErrorMessage } from "@/lib/data/errors";
import {
  getActiveGoals,
  getBudgets,
  getCommitments,
  getLedger,
  getProfile,
  getRecurringTemplates,
  getReminderSettings,
} from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { formatLocalDate } from "@/lib/format";
import { type FormState, invalid, text } from "@/lib/forms";
import { reminderScheduleSchema } from "@/lib/validation/settings";

interface NewReminder {
  title: string;
  body: string;
  linkPath: string;
}

/**
 * Creates any reminder that's due, called when the app is open. There's no server sending these
 * in the background, so a reminder appears the next time PocketPulse is opened. Only the rows that
 * are really new come back: the dedupe key makes every other call do nothing.
 */
export async function syncReminders(): Promise<NewReminder[]> {
  try {
    const { supabase, userId } = await requireSession();
    const [prefs, profile, ledger, budgets, commitments, templates, goals] = await Promise.all([
      getReminderSettings(),
      getProfile(),
      getLedger(),
      getBudgets(),
      getCommitments(),
      getRecurringTemplates(),
      getActiveGoals(),
    ]);
    const due = dueReminders({
      prefs,
      ledger,
      budgets,
      commitments: commitments.filter((c) => c.recurringTemplateId === null),
      templates,
      goals,
      nextIncomeDate: profile.nextIncomeDate,
      now: requestNow(),
      settings: { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn },
      money: moneyFormatter(profile.currency),
      dateText: formatLocalDate,
    });
    if (due.length === 0) return [];
    const { data } = await supabase
      .from("notifications")
      .upsert(
        due.map((r) => ({
          owner_id: userId,
          kind: r.kind,
          title: r.title,
          body: r.body,
          link_path: r.linkPath,
          dedupe_key: r.dedupeKey,
        })),
        { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("title, body, link_path");
    const created = (data ?? []).map((r) => ({
      title: r.title as string,
      body: (r.body as string | null) ?? "",
      linkPath: (r.link_path as string | null) ?? "/reminders",
    }));
    if (created.length > 0) revalidatePath("/", "layout");
    return created;
  } catch {
    return []; // A reminder is never worth an error on the page someone is using.
  }
}

async function updateNotification(id: string | null, patch: Record<string, string>) {
  const { supabase } = await requireSession();
  const query = supabase.from("notifications").update(patch).is("dismissed_at", null);
  const { error } = await (id ? query.eq("id", id) : query.is("read_at", null));
  if (error) return { status: "error", message: dbErrorMessage(error) } satisfies FormState;
  revalidatePath("/", "layout");
  return { status: "success", savedAt: Date.now() } satisfies FormState;
}

export async function markNotificationRead(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: "That reminder is gone." };
  return updateNotification(id.data, { read_at: new Date().toISOString() });
}

export async function dismissNotification(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: "That reminder is gone." };
  return updateNotification(id.data, { dismissed_at: new Date().toISOString() });
}

export async function markAllNotificationsRead(_prev: FormState): Promise<FormState> {
  return updateNotification(null, { read_at: new Date().toISOString() });
}

export async function saveReminderSchedule(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reminderScheduleSchema.safeParse({
    missedLoggingTime: text(formData, "missedLoggingTime"),
    missedLoggingDays: text(formData, "missedLoggingDays"),
    weeklyReviewDay: text(formData, "weeklyReviewDay"),
    upcomingIncomeDays: text(formData, "upcomingIncomeDays"),
    upcomingCommitmentDays: text(formData, "upcomingCommitmentDays"),
    savingsReviewFrequency: text(formData, "savingsReviewFrequency"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, userId } = await requireSession();
  const s = parsed.data;
  const { error } = await supabase
    .from("notification_preferences")
    .update({
      missed_logging_time: s.missedLoggingTime,
      missed_logging_days: s.missedLoggingDays,
      weekly_review_day: s.weeklyReviewDay,
      upcoming_income_days: s.upcomingIncomeDays,
      upcoming_commitment_days: s.upcomingCommitmentDays,
      savings_review_frequency: s.savingsReviewFrequency,
    })
    .eq("owner_id", userId);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  revalidatePath("/", "layout");
  return { status: "success", message: "Saved.", savedAt: Date.now() };
}

/** Remembers the browser-notification choice; the browser's own permission is still required. */
export async function saveBrowserNotifications(enabled: unknown): Promise<void> {
  if (typeof enabled !== "boolean") return;
  const { supabase, userId } = await requireSession();
  await supabase
    .from("notification_preferences")
    .update({ push_enabled: enabled })
    .eq("owner_id", userId);
  revalidatePath("/reminders");
}
