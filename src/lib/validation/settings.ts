/** Profile and preference form schemas (Settings and onboarding share them). */
import { z } from "zod";

import {
  INCOME_FREQUENCIES,
  type IncomeFrequency,
  MAX_AMOUNT_PAISE,
  REMINDER_DAY_CHOICES,
  SAVINGS_REVIEW_CHOICES,
  SUPPORTED_CURRENCIES,
  isValidTimeZone,
} from "@/domain";
import {
  amountField,
  optionalAmountField,
  optionalDateField,
  optionalTextField,
} from "@/lib/forms";
import { MOTION_PREFERENCES } from "@/lib/motion-preference";

export const THEMES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];

export type { IncomeFrequency };

export const profileNameSchema = z.object({
  displayName: optionalTextField(60, "Your name"),
});

export const appearanceSchema = z.object({
  theme: z.enum(THEMES),
  motion: z.enum(MOTION_PREFERENCES),
});

export const regionSchema = z.object({
  currency: z.enum(SUPPORTED_CURRENCIES, "Choose a currency."),
  timeZone: z
    .string()
    .trim()
    .min(1, "Choose a timezone.")
    .max(64)
    .refine(isValidTimeZone, "Choose a timezone from the list."),
  weekStartsOn: z.coerce.number().int().min(0).max(6),
});

export const incomeSchema = z
  .object({
    incomeFrequency: z.enum(INCOME_FREQUENCIES, "Choose how often money comes in."),
    nextIncomeDate: optionalDateField,
    expectedIncome: optionalAmountField,
  })
  .transform((v) =>
    // With no regular income there is no "next" date or expected amount to keep.
    v.incomeFrequency === "none" ? { ...v, nextIncomeDate: null, expectedIncome: null } : v,
  );

export const spendingSchema = z.object({
  smallPurchaseThreshold: amountField.refine(
    (paise) => paise <= Math.min(MAX_AMOUNT_PAISE, 10_000_000),
    "Use at most ₹1,00,000 for the small-purchase threshold.",
  ),
});

export const REMINDER_KEYS = [
  "missedLogging",
  "weeklyReview",
  "upcomingIncome",
  "budgetAlerts",
  "upcomingCommitments",
  "savingsReview",
] as const;
/** There's no background server or push service, so this has to be said wherever they're set up. */
export const REMINDERS_OPEN_NOTE =
  "Reminders only appear while PocketPulse is open. It can’t alert you when the app is closed, and nothing is emailed.";

export type ReminderKey = (typeof REMINDER_KEYS)[number];

export const remindersSchema = z.object({
  allDisabled: z.boolean(),
  missedLogging: z.boolean(),
  weeklyReview: z.boolean(),
  upcomingIncome: z.boolean(),
  budgetAlerts: z.boolean(),
  upcomingCommitments: z.boolean(),
  savingsReview: z.boolean(),
});
export type ReminderPreferences = z.output<typeof remindersSchema>;

const leadDays = z.coerce
  .number("Use a whole number from 0 to 14.")
  .int("Use a whole number from 0 to 14.")
  .min(0, "Use a whole number from 0 to 14.")
  .max(14, "Use a whole number from 0 to 14.");

export const reminderScheduleSchema = z.object({
  missedLoggingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time."),
  missedLoggingDays: z.enum(REMINDER_DAY_CHOICES),
  weeklyReviewDay: z.coerce.number().int().min(0).max(6),
  upcomingIncomeDays: leadDays,
  upcomingCommitmentDays: leadDays,
  savingsReviewFrequency: z.enum(SAVINGS_REVIEW_CHOICES),
});

export const privacySchema = z.object({
  includeNotesInReports: z.boolean(),
});

export const progressSchema = z.object({ showProgress: z.boolean() });
