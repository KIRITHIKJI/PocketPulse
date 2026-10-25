import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Cloud, Download, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { AppearanceSettings } from "@/components/preferences/appearance-settings";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Route } from "next";

export const metadata: Metadata = { title: "Settings" };

const SUBPAGES: { href: Route; title: string; description: string; icon: typeof Cloud }[] = [
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

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Preferences, privacy and your data." />
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Saved on this device.</CardDescription>
        </CardHeader>
        <AppearanceSettings />
      </Card>
      <ul className="grid gap-3 sm:grid-cols-3">
        {SUBPAGES.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="group flex h-full items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:border-primary/40"
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
