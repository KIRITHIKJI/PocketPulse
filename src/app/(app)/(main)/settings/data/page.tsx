import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, FileJson, FileSpreadsheet, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { DeleteAccountForm } from "@/components/settings/delete-account-form";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { requireSession } from "@/lib/data/session";

export const metadata: Metadata = { title: "Your data" };

const EXPORT_CONTENTS = [
  "Every entry: income, expenses, refunds, transfers and goal allocations, with dates, amounts in paise and rupees, categories, wallets, notes and tags",
  "Wallets with opening balances and dates",
  "Categories, subcategories and rules",
  "Budgets, savings goals, recurring templates and planned expenses",
  "Profile, preferences, reminders and rewards",
];

export default async function DataSettingsPage() {
  const { userId } = await requireSession();
  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
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

      <Surface role="region" aria-labelledby="data-export">
        <div className="flex flex-col gap-0.5">
          <h2 id="data-export" className="flex items-center gap-2 type-heading">
            <Download className="size-4 text-text-secondary" aria-hidden="true" />
            Export your data
          </h2>
          <p className="type-body text-muted-foreground">
            A copy of everything in your account, generated when you ask and downloaded to this
            device only. Deleted entries are included and marked as deleted.
          </p>
        </div>
        <Surface variant="inset" asChild>
          <ul className="list-disc gap-1 pl-8 type-body text-muted-foreground">
            {EXPORT_CONTENTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Surface>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/settings/data/export?format=json" download>
              <FileJson aria-hidden="true" />
              Everything (JSON)
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/settings/data/export?format=csv" download>
              <FileSpreadsheet aria-hidden="true" />
              Entries (CSV)
            </a>
          </Button>
        </div>
      </Surface>

      <Surface role="region" aria-labelledby="data-delete" className="border-feedback-error/30">
        <div className="flex flex-col gap-0.5">
          <h2 id="data-delete" className="flex items-center gap-2 type-heading">
            <TriangleAlert className="size-4 text-feedback-error" aria-hidden="true" />
            Delete your account
          </h2>
          <p className="type-body text-muted-foreground">
            Permanently removes your account and every record in it — entries, wallets, categories,
            budgets, goals and rewards — on all devices. It can’t be undone.
          </p>
        </div>
        <Surface variant="inset" asChild>
          <ol className="list-decimal gap-1 pl-8 type-body text-muted-foreground">
            <li>Export your data first if you want to keep a copy.</li>
            <li>Confirm by typing a phrase and re-entering your password.</li>
            <li>You’re signed out, and the account can’t be recovered.</li>
          </ol>
        </Surface>
        <DeleteAccountForm ownerId={userId} />
      </Surface>
    </div>
  );
}
