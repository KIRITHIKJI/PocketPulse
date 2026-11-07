import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Database, Landmark, Lock, Send } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PrivacyForm } from "@/components/settings/preference-forms";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Privacy" };

const FACTS = [
  {
    icon: Database,
    title: "What’s stored",
    body: "Your profile and preferences, wallets and opening balances, categories and rules, entries, budgets, goals and reminder settings — in this app’s database, under your account.",
  },
  {
    icon: Lock,
    title: "Who can see it",
    body: "Only you, signed in. The database itself refuses every other account (row-level security), not just the screens.",
  },
  {
    icon: Send,
    title: "Nothing is shared automatically",
    body: "Parent reports are only created when you ask, and only leave the app when you export or copy them yourself.",
  },
  {
    icon: Bot,
    title: "No AI services",
    body: "Category suggestions and reading your typed or spoken entries run inside PocketPulse, and expense details are never sent to an external AI. Voice entry is the one exception to know about: when you tap the microphone, your browser’s speech service turns speech into text, and some browsers send that audio to their maker. PocketPulse only receives the text.",
  },
  {
    icon: Landmark,
    title: "No bank connection",
    body: "Balances are what you enter. PocketPulse never connects to a bank and never claims a balance is verified.",
  },
] as const;

export default async function PrivacySettingsPage() {
  const profile = await getProfile();
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
        <Link href="/settings">
          <ArrowLeft aria-hidden="true" />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Privacy"
        description="Your financial data is private to your account. Nothing is shared with parents or third parties without your action."
      />
      <Surface role="region" aria-labelledby="privacy-facts">
        <h2 id="privacy-facts" className="type-heading">
          How your data is handled
        </h2>
        <ul className="flex flex-col divide-y">
          {FACTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-inset text-text-secondary">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="type-body font-medium">{title}</h3>
                <p className="type-body text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </Surface>
      <Surface role="region" aria-labelledby="privacy-report-defaults">
        <div className="flex flex-col gap-0.5">
          <h2 id="privacy-report-defaults" className="type-heading">
            Report defaults
          </h2>
          <p className="type-caption text-text-secondary">
            Applies when you create a parent report; you review it first.
          </p>
        </div>
        <PrivacyForm includeNotesInReports={profile.includeNotesInReports} summary={false} />
      </Surface>
    </div>
  );
}
