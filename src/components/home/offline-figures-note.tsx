"use client";

import { Notice } from "@/components/feedback/notice";
import { useOnlineStatus } from "@/hooks/use-online-status";

/** Offline, Home shows the figures from its last load; it says so instead of looking current. */
export function OfflineFiguresNote() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <Notice tone="offline" title="These figures are from your last connection">
      Tiles still work: what you add waits on this device and joins the figures once it syncs.
    </Notice>
  );
}
