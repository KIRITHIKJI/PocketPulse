/**
 * Onboarding steps and their schemas. Each step saves on its own and can be skipped; the same
 * records are editable later (Settings, Accounts, Budgets, Goals).
 */
import { z } from "zod";

import { ACCOUNT_KINDS } from "@/domain";
import {
  amountField,
  balanceField,
  dateField,
  optionalAmountField,
  optionalDateField,
} from "@/lib/forms";
import { accountNameField } from "@/lib/validation/accounts";

export const ONBOARDING_STEPS = [
  { id: "region", title: "Currency & timezone" },
  { id: "balance", title: "Your money today" },
  { id: "income", title: "Allowance & income" },
  { id: "budgets", title: "Monthly budgets" },
  { id: "goal", title: "A savings goal" },
  { id: "preferences", title: "Look, reminders & privacy" },
] as const;
export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export function parseStep(value: unknown): OnboardingStepId {
  return ONBOARDING_STEPS.find((s) => s.id === value)?.id ?? ONBOARDING_STEPS[0].id;
}

export function nextStep(step: OnboardingStepId): OnboardingStepId | null {
  const index = ONBOARDING_STEPS.findIndex((s) => s.id === step);
  return ONBOARDING_STEPS[index + 1]?.id ?? null;
}

export const MAX_EXTRA_ACCOUNTS = 10;

export const balancesStepSchema = z
  .object({
    openingDate: dateField,
    cashName: accountNameField,
    cashBalance: balanceField,
    extras: z
      .array(
        z.object({
          id: z.uuid(),
          name: accountNameField,
          kind: z.enum(ACCOUNT_KINDS, "Choose a type."),
          balance: balanceField,
        }),
      )
      .max(MAX_EXTRA_ACCOUNTS, `Add at most ${MAX_EXTRA_ACCOUNTS} extra wallets here.`),
  })
  .superRefine((v, ctx) => {
    const seen = new Set([v.cashName.toLowerCase()]);
    v.extras.forEach((extra, index) => {
      const key = extra.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["extras", index, "name"],
          message: "Each wallet needs a different name.",
        });
      }
      seen.add(key);
    });
  });
export type BalancesStep = z.output<typeof balancesStepSchema>;

export const budgetsStepSchema = z.object({
  total: optionalAmountField,
  categories: z.array(z.object({ categoryId: z.uuid(), amount: optionalAmountField })).max(40),
});

export const goalStepSchema = z.object({
  goalId: z.uuid(),
  title: z.string().trim().min(1, "Name your goal.").max(80, "Use at most 80 characters."),
  target: amountField,
  targetDate: optionalDateField,
});
