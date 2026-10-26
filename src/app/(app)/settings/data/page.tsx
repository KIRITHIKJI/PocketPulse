import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Your data" };

const EXPORT_CONTENTS = [
  "Every entry: income, expenses, refunds, transfers and goal allocations, with dates, amounts in paise and rupees, categories, wallets, notes and tags",
  "Wallets with opening balances and dates",
  "Categories, subcategories and rules",
  "Budgets, savings goals, recurring templates and planned expenses",
  "Profile and preferences",
];

export default function DataSettingsPage() {
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
        <Link href="/settings">
          <ArrowLeft aria-hidden="true" />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Your data"
        description="Export everything you’ve recorded, or permanently delete your account."
      />

      <Card role="region" aria-labelledby="data-export">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Download className="size-5 text-primary" aria-hidden="true" />
            <CardTitle id="data-export">Export your data</CardTitle>
          </div>
          <CardDescription>
            A spreadsheet-friendly copy of everything in your account, generated when you ask and
            downloaded to this device only.
          </CardDescription>
        </CardHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          {EXPORT_CONTENTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          The export download isn’t connected in this build yet. Your data stays complete in your
          account in the meantime.
        </p>
      </Card>

      <Card role="region" aria-labelledby="data-delete" className="border-destructive/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-destructive" aria-hidden="true" />
            <CardTitle id="data-delete">Delete your account</CardTitle>
          </div>
          <CardDescription>
            Permanently removes your account and every record in it — entries, wallets, categories,
            budgets, goals and rewards — on all devices. It can’t be undone.
          </CardDescription>
        </CardHeader>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>Export your data first if you want to keep a copy.</li>
          <li>Confirm by typing a phrase and re-entering your password.</li>
          <li>You’re signed out, and the account can’t be recovered.</li>
        </ol>
        <p className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          Account deletion isn’t connected in this build yet. Nothing about your account changes
          from this page.
        </p>
      </Card>
    </>
  );
}
