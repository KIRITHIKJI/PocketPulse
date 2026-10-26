/** Profile and preference form schemas (Settings and onboarding share them). */
import { z } from "zod";

import { MAX_AMOUNT_PAISE, SUPPORTED_CURRENCIES, isValidTimeZone } from "@/domain";
import {
  amountField,
  optionalAmountField,
  optionalDateField,
  optionalTextField,
} from "@/lib/forms";
import { MOTION_PREFERENCES } from "@/lib/motion-preference";

export const THEMES = ["dark", "light", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];

export const INCOME_FREQUENCIES = ["weekly", "biweekly", "monthly", "irregular", "none"] as const;
export type IncomeFrequency = (typeof INCOME_FREQUENCIES)[number];

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

export const privacySchema = z.object({
  includeNotesInReports: z.boolean(),
});
