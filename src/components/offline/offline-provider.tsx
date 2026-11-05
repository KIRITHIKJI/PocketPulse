"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/feedback/toast";
import type { LedgerCommand } from "@/lib/ledger/commands";
import type { QueuedOp } from "@/lib/offline/ops";
import { loadQueue } from "@/lib/offline/load-queue";
import { saveLoadedAssets, savePagesForOffline, savePagesSoon } from "@/lib/offline/pwa";
import type { EnqueueOptions } from "@/lib/offline/queue";
import { sendToServer } from "@/lib/offline/transport";

/** How often a waiting queue tries again while the app stays open. */
const RETRY_CHECK_MS = 15_000;

type OfflineContextValue = {
  /** Null until the queue has been read, so nothing flashes "all synced" on load. */
  ops: QueuedOp[] | null;
  /** Everything not yet on the server. */
  waiting: QueuedOp[];
  /** Needs a decision from the user. */
  stuck: QueuedOp[];
  signedOut: boolean;
  lastSyncedAt: number | null;
  syncing: boolean;
  syncNow: () => Promise<void>;
  enqueue: (command: LedgerCommand, options?: EnqueueOptions) => Promise<QueuedOp>;
  /** True when an earlier queued operation touches the same record, so this one must follow it. */
  mustFollowQueue: (command: LedgerCommand) => boolean;
};

const OfflineContext = React.createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const value = React.useContext(OfflineContext);
  if (!value) throw new Error("useOffline must be used inside OfflineProvider.");
  return value;
}

function isUnfinished(op: QueuedOp) {
  return op.status !== "synced";
}

/**
 * Owns this device's queue for the signed-in user: shows it live, in every tab, and sends it
 * whenever there's a chance of getting through (on opening, on reconnecting, when the app comes
 * back to the screen, and on a timer while anything waits).
 */
export function OfflineProvider({
  ownerId,
  children,
}: {
  ownerId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [ops, setOps] = React.useState<QueuedOp[] | null>(null);
  const [signedOut, setSignedOut] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  const flushing = React.useRef(false);
  const again = React.useRef(false);

  React.useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | undefined;
    // Loaded after the page is up, so Dexie isn't part of every page's first JavaScript.
    void Promise.all([import("dexie"), loadQueue()])
      .then(([{ liveQuery }, { listOps }]) => {
        if (cancelled) return;
        subscription = liveQuery(() => listOps(ownerId)).subscribe({
          next: setOps,
          error: () => setOps([]),
        });
        saveLoadedAssets();
      })
      .catch(() => {
        // The code couldn't load (offline, never saved). Show an empty queue, as when
        // IndexedDB is unavailable; each save still tries the queue itself.
        if (!cancelled) setOps([]);
      });
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [ownerId]);

  const flush = React.useCallback(
    async (force = false) => {
      if (!ownerId || !navigator.onLine) return;
      // One at a time per tab; a request during a run starts one more, so a new entry isn't missed.
      if (flushing.current) {
        again.current = true;
        return;
      }
      flushing.current = true;
      setSyncing(true);
      let total = 0;
      try {
        do {
          again.current = false;
          const { flushQueue } = await loadQueue();
          const { synced, stopped } = await flushQueue(ownerId, sendToServer, { force });
          total += synced;
          setSignedOut(stopped === "signed_out");
        } while (again.current);
      } catch {
        // IndexedDB is unavailable. The next trigger tries again; nothing has been lost.
      } finally {
        flushing.current = false;
        setSyncing(false);
      }
      if (total > 0) {
        show({
          tone: "success",
          message: total === 1 ? "1 entry synced." : `${total} entries synced.`,
        });
        router.refresh();
        savePagesSoon();
      }
    },
    [ownerId, router, show],
  );

  // "syncing" counts: if the tab that was sending it died, its claim expires and it goes again.
  const waitingCount =
    ops?.filter((op) => op.status === "pending" || op.status === "syncing").length ?? 0;

  React.useEffect(() => {
    const run = () => void flush();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    const timer = waitingCount > 0 ? window.setInterval(run, RETRY_CHECK_MS) : undefined;
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [flush, waitingCount]);

  // Also covers opening the app with entries left from last time, and a new entry being queued.
  React.useEffect(() => {
    if (waitingCount === 0) return;
    const start = window.setTimeout(() => void flush(), 0);
    return () => window.clearTimeout(start);
  }, [flush, waitingCount]);

  React.useEffect(() => {
    if (!ownerId || !("serviceWorker" in navigator)) return;
    const save = () => {
      savePagesForOffline();
      saveLoadedAssets();
    };
    save();
    // On the first visit the worker takes over a moment after the page has loaded.
    navigator.serviceWorker.addEventListener("controllerchange", save);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", save);
  }, [ownerId]);

  const value = React.useMemo<OfflineContextValue>(() => {
    const waiting = ops?.filter(isUnfinished) ?? [];
    const syncedTimes = ops?.flatMap((op) => (op.syncedAt ? [op.syncedAt] : [])) ?? [];
    return {
      ops,
      waiting,
      stuck: waiting.filter((op) => op.status === "failed" || op.status === "conflict"),
      signedOut,
      lastSyncedAt: syncedTimes.length > 0 ? Math.max(...syncedTimes) : null,
      syncing,
      syncNow: () => flush(true),
      enqueue(command, options) {
        if (!ownerId) throw new Error("No signed-in account to save this for.");
        return loadQueue().then(({ enqueue }) => enqueue(ownerId, command, options));
      },
      mustFollowQueue(command) {
        const keys = new Set(
          "draft" in command
            ? [command.draft.id, command.draft.refundOfId]
            : "id" in command
              ? [command.id]
              : [],
        );
        return waiting.some((op) => op.keys.some((key) => keys.has(key)));
      },
    };
  }, [ops, signedOut, syncing, flush, ownerId]);

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
