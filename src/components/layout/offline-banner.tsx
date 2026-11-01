"use client";

import * as React from "react";
import Link from "next/link";
import { CircleAlert, CloudUpload, LogIn, WifiOff, type LucideIcon } from "lucide-react";

import { useOffline } from "@/components/offline/offline-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { savedPageTime } from "@/lib/offline/pwa";

const entries = (n: number) => (n === 1 ? "1 entry" : `${n} entries`);

function Bar({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: "warning" | "primary";
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid="sync-banner"
      className={
        tone === "warning"
          ? "flex items-start gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm sm:px-6 lg:px-8"
          : "flex items-start gap-2 border-b border-primary/30 bg-primary-soft px-4 py-2 text-sm sm:px-6 lg:px-8"
      }
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

function SyncLink({ children }: { children: React.ReactNode }) {
  return (
    <Link href="/settings/sync" className="font-medium underline underline-offset-4">
      {children}
    </Link>
  );
}

function clock(time: number) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(time);
}

/** Connection and sync state, always in the same place, shown only when there's something to say. */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { waiting, stuck, signedOut } = useOffline();
  const [savedAt, setSavedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (online) return;
    let current = true;
    void savedPageTime().then((time) => {
      if (current) setSavedAt(time);
    });
    return () => {
      current = false;
    };
  }, [online]);

  if (!online) {
    return (
      <Bar icon={WifiOff} tone="warning">
        You’re offline. New entries stay on this device and sync when you’re back; other changes
        need a connection.
        {savedAt ? ` Figures here are from ${clock(savedAt)}.` : ""}
        {waiting.length > 0 && (
          <>
            {" "}
            <SyncLink>{entries(waiting.length)} waiting</SyncLink>
          </>
        )}
      </Bar>
    );
  }
  if (signedOut) {
    return (
      <Bar icon={LogIn} tone="warning">
        You’ve been signed out, so {entries(waiting.length)} can’t sync.{" "}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Sign in again
        </Link>
      </Bar>
    );
  }
  if (stuck.length > 0) {
    return (
      <Bar icon={CircleAlert} tone="warning">
        {entries(stuck.length)} couldn’t sync. <SyncLink>See what happened</SyncLink>
      </Bar>
    );
  }
  if (waiting.length > 0) {
    return (
      <Bar icon={CloudUpload} tone="primary">
        Syncing {entries(waiting.length)}… <SyncLink>Sync status</SyncLink>
      </Bar>
    );
  }
  return null;
}
