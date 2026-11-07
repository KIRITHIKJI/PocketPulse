import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { InstallApp } from "@/components/offline/install-app";
import { SyncCenter } from "@/components/offline/sync-center";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { getProfile } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Sync" };

export default async function SyncSettingsPage() {
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
        title="Sync"
        description="See whether entries on this device are synced, pending or need attention."
      />
      <SyncCenter currency={profile.currency} timeZone={profile.timeZone} />
      <InstallApp />
      <Surface asChild>
        <section aria-labelledby="sync-how" className="type-body text-muted-foreground">
          <h2 id="sync-how" className="type-heading text-foreground">
            How offline works
          </h2>
          <p>
            Entries, edits and deletions made with no connection stay on this device and sync while
            PocketPulse is open. If you close the app first, they sync the next time you open it.
            Each one has its own id, so sending it twice can’t save it twice.
          </p>
          <p>
            Budgets, goals, wallets, categories and settings need a connection to change. Screens
            you opened recently are saved on this device for offline reading, and are cleared when
            you sign out.
          </p>
        </section>
      </Surface>
    </div>
  );
}
