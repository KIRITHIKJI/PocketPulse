import type { Metadata } from "next";

import { ReloadWhenOnline } from "@/components/offline/reload-when-online";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

/**
 * What the service worker shows for a screen it has no saved copy of. Plain links on purpose:
 * each is a full page load, which the service worker can answer from its saved copies.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <ReloadWhenOnline />
      <h1 className="sr-only">You’re offline</h1>
      <Logo />
      <StatePanel
        variant="offline"
        title="This screen isn’t saved on this device"
        description="You’re offline, and this is a screen PocketPulse hasn’t saved yet. You can still record what you spend: it stays on this device and syncs when you’re back."
        actions={
          <>
            <Button asChild>
              <a href="/add">Add an entry</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/home">Go home</a>
            </Button>
          </>
        }
      />
    </main>
  );
}
