import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Cloud } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sync" };

export default function SyncSettingsPage() {
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
        <Link href="/settings">
          <ArrowLeft aria-hidden="true" />
          Settings
        </Link>
      </Button>
      <PageHeader
        title="Sync"
        description="See whether entries on this device are synced, pending or need attention."
      />
      <StatePanel
        icon={Cloud}
        title="Nothing waiting to sync"
        description="Entries saved while offline will be listed here with their status until they reach your account."
      />
    </>
  );
}
