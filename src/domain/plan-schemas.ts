/** Zod schemas for planning records: savings goals, commitments, recurring templates and budgets. */
import { z } from "zod";

import { amountPaiseSchema, isoDateTimeSchema, localDateSchema } from "./schemas";

// --- Savings goals -------------------------------------------------------------

export const GOAL_STATUSES = ["active", "paused", "completed", "archived"] as const;

export const savingsGoalSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string().trim().min(1).max(80),
  icon: z.string().max(40).nullable().default(null),
  targetPaise: amountPaiseSchema,
  targetDate: localDateSchema.nullable().default(null),
  status: z.enum(GOAL_STATUSES).default("active"),
  completedAt: isoDateTimeSchema.nullable().default(null),
});
export type SavingsGoal = z.output<typeof savingsGoalSchema>;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

// --- Planned / committed future expenses --------------------------------------

export const commitmentSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  title: z.string().trim().min(1).max(120),
  amountPaise: amountPaiseSchema,
  dueDate: localDateSchema,
  categoryId: z.uuid().nullable().default(null),
  subcategoryId: z.uuid().nullable().default(null),
  accountId: z.uuid().nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
  /** With `cancelledAt`, marks a skipped occurrence of a recurring template. */
  recurringTemplateId: z.uuid().nullable().default(null),
  recurringOccurrence: localDateSchema.nullable().default(null),
  /** Set when the bill has actually been paid: the expense that paid it. */
  paidTransactionId: z.uuid().nullable().default(null),
  cancelledAt: isoDateTimeSchema.nullable().default(null),
});
export type Commitment = z.output<typeof commitmentSchema>;

// --- Recurring templates --------------------------------------------------------------------

export const RECURRING_KINDS = ["income", "expense"] as const;
export const RECURRING_CADENCES = ["daily", "weekly", "monthly", "yearly"] as const;
export const RECURRING_MODES = ["confirm", "remind"] as const;

export const recurringTemplateSchema = z.object({
  id: z.uuid(),
  ownerId: z.uuid(),
  kind: z.enum(RECURRING_KINDS),
  title: z.string().trim().min(1).max(80),
  amountPaise: amountPaiseSchema,
  accountId: z.uuid().nullable().default(null),
  categoryId: z.uuid().nullable().default(null),
  subcategoryId: z.uuid().nullable().default(null),
  cadence: z.enum(RECURRING_CADENCES),
  intervalCount: z.number().int().min(1).max(12).default(1),
  /** The schedule's reference date: occurrences are counted from here. */
  anchorDate: localDateSchema,
  /** Nothing before this date is due (moves forward when a paused template resumes). */
  nextDueDate: localDateSchema,
  endDate: localDateSchema.nullable().default(null),
  /** `confirm` asks to record the entry when due; `remind` is only a reminder. */
  mode: z.enum(RECURRING_MODES).default("confirm"),
  pausedAt: isoDateTimeSchema.nullable().default(null),
  archivedAt: isoDateTimeSchema.nullable().default(null),
});
export type RecurringTemplate = z.output<typeof recurringTemplateSchema>;

// --- Budgets -------------------------------------------------------------------

export const budgetSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    /** null = total budget across all spending categories. */
    categoryId: z.uuid().nullable().default(null),
    limitPaise: amountPaiseSchema,
    period: z.enum(["weekly", "monthly", "custom"]).default("monthly"),
    customFrom: localDateSchema.nullable().default(null),
    customTo: localDateSchema.nullable().default(null),
    /** Alert thresholds in basis points of the limit (8000 = 80 %). */
    alertThresholdsBp: z
      .array(z.number().int().min(1).max(100_000))
      .max(5)
      .default([5_000, 8_000, 10_000]),
  })
  .superRefine((b, ctx) => {
    if (b.period === "custom" && (!b.customFrom || !b.customTo)) {
      ctx.addIssue({ code: "custom", path: ["customFrom"], message: "Choose start and end dates" });
    }
    if (b.customFrom && b.customTo && b.customFrom > b.customTo) {
      ctx.addIssue({
        code: "custom",
        path: ["customTo"],
        message: "End date is before start date",
      });
    }
  });
export type Budget = z.output<typeof budgetSchema>;
