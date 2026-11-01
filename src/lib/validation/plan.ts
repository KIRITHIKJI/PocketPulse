/** Form schemas for budgets, goals, planned bills, recurring items and safe-to-spend planning. */
import { z } from "zod";

import { RECURRING_CADENCES, RECURRING_KINDS, RECURRING_MODES, isLocalDate } from "@/domain";
import { CATEGORY_ICON_NAMES } from "@/lib/category-style";
import {
  amountField,
  dateField,
  optionalAmountField,
  optionalDateField,
  optionalTextField,
} from "@/lib/forms";

const optionalId = z
  .string()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.uuid("Choose from the list.").nullable());

export const BUDGET_PERIODS = ["monthly", "weekly", "custom"] as const;

/** "50, 80, 100" → basis points. Whole percents only, so no rate is ever a float. */
export const thresholdsField = z.string().transform((value, ctx) => {
  const parts = value
    .split(/[,\s]+/)
    .map((part) => part.replace(/%$/, ""))
    .filter(Boolean);
  if (parts.length > 5 || parts.some((part) => !/^\d{1,4}$/.test(part))) {
    ctx.addIssue({ code: "custom", message: "Use up to 5 whole percents, like 50, 80, 100." });
    return z.NEVER;
  }
  const percents = [...new Set(parts.map(Number))].sort((a, b) => a - b);
  if (percents.some((p) => p < 1 || p > 1000)) {
    ctx.addIssue({ code: "custom", message: "Each percent must be between 1 and 1000." });
    return z.NEVER;
  }
  return percents.map((p) => p * 100);
});

export const budgetFormSchema = z
  .object({
    id: z.uuid(),
    categoryId: optionalId,
    limit: amountField,
    period: z.enum(BUDGET_PERIODS, "Choose a period."),
    customFrom: optionalDateField,
    customTo: optionalDateField,
    thresholds: thresholdsField,
  })
  .superRefine((v, ctx) => {
    if (v.period !== "custom") return;
    if (!v.customFrom) {
      ctx.addIssue({ code: "custom", path: ["customFrom"], message: "Choose a start date." });
    }
    if (!v.customTo) {
      ctx.addIssue({ code: "custom", path: ["customTo"], message: "Choose an end date." });
    }
    if (v.customFrom && v.customTo && v.customFrom > v.customTo) {
      ctx.addIssue({
        code: "custom",
        path: ["customTo"],
        message: "The end date is before the start date.",
      });
    }
  });

export const goalFormSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Name your goal.").max(80, "Use at most 80 characters."),
  icon: z.enum(CATEGORY_ICON_NAMES, "Choose an icon."),
  target: amountField,
  targetDate: optionalDateField,
});

export const GOAL_STATUS_ACTIONS = ["pause", "resume", "complete", "reopen", "archive"] as const;
export type GoalStatusAction = (typeof GOAL_STATUS_ACTIONS)[number];

export const goalStatusSchema = z.object({
  id: z.uuid(),
  action: z.enum(GOAL_STATUS_ACTIONS),
});

export const billFormSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1, "Name this bill.").max(120, "Use at most 120 characters."),
  amount: amountField,
  dueDate: dateField,
  categoryId: optionalId,
  subcategoryId: optionalId,
  accountId: optionalId,
  note: optionalTextField(500, "The note"),
});

export const recurringFormSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(RECURRING_KINDS, "Choose income or expense."),
    title: z.string().trim().min(1, "Name this item.").max(80, "Use at most 80 characters."),
    amount: amountField,
    cadence: z.enum(RECURRING_CADENCES, "Choose how often."),
    intervalCount: z.coerce
      .number("Use a whole number from 1 to 12.")
      .int("Use a whole number from 1 to 12.")
      .min(1, "Use a whole number from 1 to 12.")
      .max(12, "Use a whole number from 1 to 12."),
    nextDueDate: dateField,
    endDate: optionalDateField,
    mode: z.enum(RECURRING_MODES, "Choose what happens when it’s due."),
    categoryId: optionalId,
    subcategoryId: optionalId,
    accountId: optionalId,
  })
  .refine((v) => v.endDate === null || v.endDate >= v.nextDueDate, {
    path: ["endDate"],
    message: "The end date is before the next due date.",
  });

export const skipOccurrenceSchema = z.object({
  templateId: z.uuid(),
  occurrence: z.string().refine(isLocalDate, "Choose a valid date."),
});

export const planningSchema = z.object({
  nextIncomeDate: optionalDateField,
  reserve: optionalAmountField,
});

export const nextIncomeDateSchema = z.object({ nextIncomeDate: dateField });
