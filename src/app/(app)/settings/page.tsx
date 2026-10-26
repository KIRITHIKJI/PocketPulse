import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight, Cloud, Download, ListChecks, ShieldCheck, Tags, Wallet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AppearanceSettings } from "@/components/preferences/appearance-settings";
import {
  IncomeForm,
  PrivacyForm,
  ProfileNameForm,
  RegionForm,
  RemindersForm,
  SpendingForm,
} from "@/components/settings/settings-forms";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toLocalDate } from "@/domain";
import { getProfile, getReminderPreferences, hasAnyTransactions } from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { timeZoneOptions } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

const LINKS: { href: Route; title: string; description: string; icon: typeof Cloud }[] = [
  {
    href: "/accounts",
    title: "Wallets",
    description: "Opening balances, default wallet, archive.",
    icon: Wallet,
  },
  {
    href: "/categories",
    title: "Categories",
    description: "Subcategories, rules, merge, uncategorized.",
    icon: Tags,
  },
  {
    href: "/onboarding",
    title: "Setup guide",
    description: "Walk through the first-time setup again.",
    icon: ListChecks,
  },
  {
    href: "/settings/privacy",
    title: "Privacy",
    description: "What’s stored, and what is never shared.",
    icon: ShieldCheck,
  },
  {
    href: "/settings/sync",
    title: "Sync",
    description: "Pending, synced and failed entries on this device.",
    icon: Cloud,
  },
  {
    href: "/settings/data",
    title: "Your data",
    description: "Export everything or delete your account.",
    icon: Download,
  },
];

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id}>
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children}
    </Card>
  );
}

export default async function SettingsPage() {
  const session = await requireSession();
  const [profile, reminders, locked] = await Promise.all([
    getProfile(),
    getReminderPreferences(),
    hasAnyTransactions(),
  ]);
  const today = toLocalDate(requestNow(), profile.timeZone);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile and preferences, saved to your account and the same on every device."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Section id="settings-profile" title="Profile" description={session.email ?? undefined}>
            <ProfileNameForm displayName={profile.displayName} />
          </Section>
          <Section
            id="settings-appearance"
            title="Appearance"
            description="Saved to your account as soon as you choose."
          >
            <AppearanceSettings />
          </Section>
          <Section id="settings-region" title="Currency & region">
            <RegionForm
              currency={profile.currency}
              timeZone={profile.timeZone}
              weekStartsOn={profile.weekStartsOn}
              timeZones={timeZoneOptions(profile.timeZone)}
              currencyLocked={locked}
            />
          </Section>
          <Section
            id="settings-income"
            title="Allowance & income"
            description="For planning only. Money counts once you record it."
          >
            <IncomeForm
              incomeFrequency={profile.incomeFrequency}
              nextIncomeDate={profile.nextIncomeDate}
              expectedIncomePaise={profile.expectedIncomePaise}
              today={today}
            />
          </Section>
        </div>
        <div className="flex flex-col gap-6">
          <Section id="settings-spending" title="Spending insights">
            <SpendingForm thresholdPaise={profile.smallPurchaseThresholdPaise} />
          </Section>
          <Section
            id="settings-reminders"
            title="Reminders"
            description="Optional and quiet by default."
          >
            <RemindersForm prefs={reminders} />
          </Section>
          <Section id="settings-privacy" title="Privacy">
            <PrivacyForm includeNotesInReports={profile.includeNotesInReports} />
          </Section>
        </div>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full items-center gap-3 rounded-2xl border bg-card p-4 transition-colors outline-none hover:border-primary/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{description}</span>
              </span>
              <ChevronRight
                className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
