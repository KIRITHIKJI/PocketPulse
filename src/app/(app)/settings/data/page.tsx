import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Your data" };

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
      <StatePanel
        icon={Download}
        title="No data to export yet"
        description="Exports include every transaction, category, budget and goal in a spreadsheet-friendly format."
      />
    </>
  );
}
