"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning sm:px-6 lg:px-8"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      You’re offline. Changes can’t be saved until your connection returns.
    </div>
  );
}
