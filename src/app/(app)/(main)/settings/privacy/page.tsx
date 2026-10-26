import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bot, Database, Landmark, Lock, Send } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PrivacyForm } from "@/components/settings/settings-forms";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    body: "Category suggestions and text/voice parsing run inside PocketPulse. Expense details are never sent to an external AI.",
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
    <>
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
      <ul className="grid gap-3 md:grid-cols-2">
        {FACTS.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Card className="h-full flex-row gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Report defaults</CardTitle>
          <CardDescription>
            Applies when you create a parent report; you review it first.
          </CardDescription>
        </CardHeader>
        <PrivacyForm includeNotesInReports={profile.includeNotesInReports} />
      </Card>
    </>
  );
}
