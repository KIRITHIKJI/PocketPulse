import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";

import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Set up PocketPulse" };

const STEPS = [
  "Opening tracked balance and the date it applies from",
  "Wallets you want to track — cash, bank, UPI",
  "Currency and timezone (₹ INR, Asia/Kolkata by default)",
  "Allowance or income frequency and next expected date",
  "Starting budgets and savings goals",
  "Theme, reminders and privacy preferences",
] as const;

export default function OnboardingPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Set up PocketPulse</h1>
        <p className="text-muted-foreground">
          A few optional steps — skip any of them and change them later in Settings.
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-3 rounded-xl border bg-card/70 px-4 py-3">
            <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <span className="text-sm">{step}</span>
          </li>
        ))}
      </ol>
      <StatePanel
        icon={ListChecks}
        title="Your account is ready"
        description="Default categories and quick-add tiles are already set up for you. PocketPulse only reports what you record — nothing is pre-filled."
        actions={
          <Button asChild>
            <Link href="/home">Go to Home</Link>
          </Button>
        }
      />
    </div>
  );
}
