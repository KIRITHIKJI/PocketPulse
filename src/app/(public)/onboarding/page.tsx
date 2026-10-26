import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Info } from "lucide-react";

import { SubmitButton } from "@/components/forms/form-parts";
import {
  BalancesStepForm,
  BudgetsStepForm,
  GoalStepForm,
  PreferencesStepForm,
} from "@/components/onboarding/step-forms";
import { AppearanceSettings } from "@/components/preferences/appearance-settings";
import { PreferenceSync } from "@/components/providers/preference-sync";
import { IncomeForm, RegionForm } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categoryTree, toLocalDate } from "@/domain";
import { finishOnboarding } from "@/lib/actions/onboarding";
import {
  ensureDefaultAccount,
  getAccounts,
  getActiveGoals,
  getCategories,
  getMonthlyBudgets,
  getProfile,
  getReminderPreferences,
  hasAnyTransactions,
} from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { timeZoneOptions } from "@/lib/format";
import { stepHref } from "@/lib/onboarding-routes";
import { cn } from "@/lib/utils";
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  nextStep,
  parseStep,
} from "@/lib/validation/onboarding";

export const metadata: Metadata = { title: "Set up PocketPulse" };

const INTROS: Record<OnboardingStepId, string> = {
  region: "Used for every amount and to decide which day each entry belongs to.",
  balance:
    "How much you have right now, as you count it. PocketPulse can only report what you enter: these are your numbers, not a verified bank balance.",
  income: "When your next pocket money or income usually arrives, so planning can spread it out.",
  budgets: "Optional monthly targets. You can add or change budgets any time.",
  goal: "Something you’d like to save up for. Optional — you can add goals later.",
  preferences: "How PocketPulse looks, what it may remind you about, and what reports include.",
};

function SkipSetup() {
  return (
    <form action={finishOnboarding}>
      <SubmitButton pendingLabel="Finishing…" variant="ghost" size="default">
        Skip setup
      </SubmitButton>
    </form>
  );
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const step = parseStep((await searchParams).step);
  const session = await requireSession();
  // Works the same for users seeded by the signup trigger or by the backfill: the profile read
  // repairs missing defaults, and the default wallet is created here if it doesn't exist yet.
  const profile = await getProfile();
  const wallet = await ensureDefaultAccount(session);
  const today = toLocalDate(requestNow(), profile.timeZone);
  const index = ONBOARDING_STEPS.findIndex((s) => s.id === step);
  const following = nextStep(step);
  const next = following ? stepHref(following) : "/home";
  const previous = index > 0 ? ONBOARDING_STEPS[index - 1]!.id : null;

  const skip = following ? (
    <Button variant="ghost" asChild>
      <Link href={stepHref(following)}>Skip this step</Link>
    </Button>
  ) : (
    <SkipSetup />
  );

  let content: React.ReactNode;
  switch (step) {
    case "region":
      content = (
        <RegionForm
          currency={profile.currency}
          timeZone={profile.timeZone}
          weekStartsOn={profile.weekStartsOn}
          timeZones={timeZoneOptions(profile.timeZone)}
          currencyLocked={await hasAnyTransactions()}
          next={next}
          submitLabel="Save & continue"
          footer={skip}
        />
      );
      break;
    case "balance": {
      const accounts = await getAccounts();
      // Wallets that share the default wallet's date are edited here; others on the Wallets page.
      const extras = accounts.filter(
        (a) => !a.isDefault && !a.archivedAt && a.openingBalanceDate === wallet.openingBalanceDate,
      );
      content = (
        <BalancesStepForm
          next={next}
          footer={skip}
          today={today}
          defaultWallet={wallet}
          extras={extras.map((a) => ({
            id: a.id,
            name: a.name,
            kind: a.kind,
            openingBalancePaise: a.openingBalancePaise,
          }))}
        />
      );
      break;
    }
    case "income":
      content = (
        <IncomeForm
          incomeFrequency={profile.incomeFrequency}
          nextIncomeDate={profile.nextIncomeDate}
          expectedIncomePaise={profile.expectedIncomePaise}
          today={today}
          next={next}
          submitLabel="Save & continue"
          footer={skip}
        />
      );
      break;
    case "budgets": {
      const [categories, budgets] = await Promise.all([getCategories(), getMonthlyBudgets()]);
      const limitFor = (id: string | null) =>
        budgets.find((b) => b.categoryId === id)?.limitPaise ?? null;
      content = (
        <BudgetsStepForm
          next={next}
          footer={skip}
          total={limitFor(null)}
          categories={categoryTree(categories, "expense").map(({ category: c }) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            color: c.color,
            limitPaise: limitFor(c.id),
          }))}
        />
      );
      break;
    }
    case "goal": {
      const existing = (await getActiveGoals())[0];
      content = (
        <GoalStepForm
          next={next}
          footer={skip}
          today={today}
          goal={existing ?? { id: randomUUID(), title: "", targetPaise: null, targetDate: null }}
        />
      );
      break;
    }
    case "preferences":
      content = (
        <div className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Look & motion</legend>
            <AppearanceSettings />
          </fieldset>
          <PreferencesStepForm
            footer={skip}
            reminders={await getReminderPreferences()}
            includeNotesInReports={profile.includeNotesInReports}
          />
        </div>
      );
      break;
  }

  const current = ONBOARDING_STEPS[index]!;
  return (
    <PreferenceSync theme={profile.theme} motion={profile.motion}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 py-6 sm:py-10">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">
            {profile.onboardingCompletedAt
              ? "Setup guide"
              : `Welcome${profile.displayName ? `, ${profile.displayName}` : ""}`}{" "}
            · Step {index + 1} of {ONBOARDING_STEPS.length}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{current.title}</h1>
          <p className="text-muted-foreground">{INTROS[step]}</p>
        </div>

        <nav aria-label="Setup steps">
          <ol className="flex flex-wrap gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <li key={s.id}>
                <Link
                  href={stepHref(s.id)}
                  aria-current={s.id === step ? "step" : undefined}
                  className={cn(
                    "flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    s.id === step
                      ? "border-primary bg-primary-soft text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {i < index ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{i + 1}</span>
                  )}
                  <span className={s.id === step ? "" : "sr-only sm:not-sr-only"}>{s.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        {step === "region" && !profile.onboardingCompletedAt && (
          <p className="flex gap-2 rounded-2xl border bg-card/70 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            Every step is optional — skip any of them and change them later in Settings. Your
            default categories and quick-add tiles are already set up.
          </p>
        )}

        <Card className="p-5 sm:p-6">{content}</Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {previous ? (
            <Button variant="ghost" asChild>
              <Link href={stepHref(previous)}>
                <ArrowLeft aria-hidden="true" />
                Back
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {following && <SkipSetup />}
        </div>
      </div>
    </PreferenceSync>
  );
}
