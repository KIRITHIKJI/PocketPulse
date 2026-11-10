import "server-only";

import { cache } from "react";

import { type CurrencyCode, type ReminderSettings, type Weekday } from "@/domain";
import { ensureDefaults } from "@/lib/auth/defaults";
import { DataLoadError } from "@/lib/data/errors";
import { diagnose } from "@/lib/diagnostics";
import { optionalSession, requireSession } from "@/lib/data/session";
import type { MotionPreference } from "@/lib/motion-preference";
import type {
  IncomeFrequency,
  ReminderPreferences,
  ThemePreference,
} from "@/lib/validation/settings";
import { type Row } from "./shared";

export interface Profile {
  displayName: string | null;
  currency: CurrencyCode;
  timeZone: string;
  weekStartsOn: Weekday;
  theme: ThemePreference;
  motion: MotionPreference;
  smallPurchaseThresholdPaise: number;
  incomeFrequency: IncomeFrequency;
  nextIncomeDate: string | null;
  expectedIncomePaise: number | null;
  safeToSpendReservePaise: number;
  includeNotesInReports: boolean;
  onboardingCompletedAt: string | null;
  /** Show XP, levels and missions on Home and in navigation (Settings → Progress). */
  showProgress: boolean;
}

function toProfile(row: Row): Profile {
  return {
    displayName: (row.display_name as string | null) ?? null,
    currency: row.currency as CurrencyCode,
    timeZone: row.time_zone as string,
    weekStartsOn: Number(row.week_starts_on) as Weekday,
    theme: row.theme as ThemePreference,
    motion: row.motion as MotionPreference,
    smallPurchaseThresholdPaise: Number(row.small_purchase_threshold_paise),
    incomeFrequency: row.income_frequency as IncomeFrequency,
    nextIncomeDate: (row.next_income_date as string | null) ?? null,
    expectedIncomePaise:
      row.expected_income_paise === null ? null : Number(row.expected_income_paise),
    safeToSpendReservePaise: Number(row.safe_to_spend_reserve_paise ?? 0),
    includeNotesInReports: Boolean(row.include_notes_in_reports),
    onboardingCompletedAt: (row.onboarding_completed_at as string | null) ?? null,
    // Absent before migration 20261106000200: progress features stay on, as they were.
    showProgress: row.show_progress !== false,
  };
}

/**
 * The signed-in user's profile. If it's missing (a user created before the signup trigger whose
 * defaults weren't backfilled), the idempotent defaults RPC runs once and the read is retried.
 */
export const getProfile = cache(async (): Promise<Profile> => {
  const { supabase } = await requireSession();
  const read = () => supabase.from("profiles").select("*").maybeSingle();
  let { data, error } = await read();
  if (!error && !data) {
    await ensureDefaults(supabase);
    ({ data, error } = await read());
  }
  if (error || !data) {
    diagnose("profile: read failed", {
      code: error?.code ?? null,
      message: error && !error.code ? error.message.slice(0, 80) : null,
      empty: !error && !data,
    });
    throw new DataLoadError("your profile", error?.code);
  }
  return toProfile(data);
});

/** The one read of the reminder settings row; both views below are built from it. */
const getNotificationPreferencesRow = cache(async () => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase.from("notification_preferences").select("*").maybeSingle();
  if (error) throw new DataLoadError("reminder preferences", error.code);
  return data;
});

export const getReminderPreferences = cache(async (): Promise<ReminderPreferences> => {
  const data = await getNotificationPreferencesRow();
  return {
    allDisabled: Boolean(data?.all_disabled),
    missedLogging: Boolean(data?.missed_logging),
    weeklyReview: Boolean(data?.weekly_review),
    upcomingIncome: Boolean(data?.upcoming_income),
    budgetAlerts: data ? Boolean(data.budget_alerts) : true,
    upcomingCommitments: Boolean(data?.upcoming_commitments),
    savingsReview: Boolean(data?.savings_review),
  };
});

export const getReminderSettings = cache(async (): Promise<ReminderSettings> => {
  const [data, preferences] = await Promise.all([
    getNotificationPreferencesRow(),
    getReminderPreferences(),
  ]);
  return {
    ...preferences,
    missedLoggingTime: String(data?.missed_logging_time ?? "21:00").slice(0, 5),
    missedLoggingDays: data?.missed_logging_days ?? "daily",
    weeklyReviewDay: Number(data?.weekly_review_day ?? 0),
    upcomingIncomeDays: Number(data?.upcoming_income_days ?? 1),
    upcomingCommitmentDays: Number(data?.upcoming_commitment_days ?? 2),
    savingsReviewFrequency: data?.savings_review_frequency ?? "monthly",
  };
});

interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  linkPath: string | null;
  scheduledFor: string;
  read: boolean;
}

/** The newest reminders that haven't been dismissed. */
export const getNotifications = cache(async (): Promise<InboxNotification[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link_path, scheduled_for, read_at")
    .is("dismissed_at", null)
    .order("scheduled_for", { ascending: false })
    .limit(50);
  if (error) throw new DataLoadError("your reminders", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    linkPath: (r.link_path as string | null) ?? null,
    scheduledFor: r.scheduled_for as string,
    read: r.read_at !== null,
  }));
});

/**
 * Reminders not yet read or dismissed, for the header's bell; 0 when signed out. The layout
 * starts it with the profile read, so it doesn't add a round of its own to every page.
 */
export const getUnreadCount = cache(async (): Promise<number> => {
  const session = await optionalSession();
  if (!session) return 0;
  const { count } = await session.supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .is("dismissed_at", null);
  return count ?? 0;
});
