"use client";

import * as React from "react";
import { CheckCircle2, CloudOff, RefreshCw } from "lucide-react";

import { useToast } from "@/components/feedback/toast";
import { useOffline } from "@/components/offline/offline-provider";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { type CurrencyCode } from "@/domain";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { QueuedOp } from "@/lib/offline/ops";
import { loadQueue } from "@/lib/offline/load-queue";
import { type ResolutionKey, resolutionCommands, resolutionsFor } from "@/lib/offline/resolve";
import {
  at,
  canEdit,
  CompareVersions,
  ConfirmDiscard,
  EditQueuedEntry,
} from "@/components/offline/queued-entry-actions";
import { opAmount, StatusBadge } from "@/components/offline/sync-status";

function OpRow({
  op,
  currency,
  timeZone,
}: {
  op: QueuedOp;
  currency: CurrencyCode;
  timeZone: string;
}) {
  const { show } = useToast();
  const { syncNow } = useOffline();
  const amount = opAmount(op, currency);
  const open = op.status !== "synced" && op.status !== "syncing";

  async function resolve(key: ResolutionKey) {
    const choice = resolutionCommands(op, key);
    if (!choice) {
      show({ tone: "error", message: "That choice isn’t available for this entry." });
      return;
    }
    await (await loadQueue()).replaceOp(op.opId, choice.command, { label: op.label }, choice.then);
    await syncNow();
  }

  async function retry() {
    await (await loadQueue()).retryOp(op.opId);
    await syncNow();
  }

  return (
    <li
      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
      data-testid="sync-op"
      data-op-id={op.opId}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1 basis-40">
          <p className="type-body font-medium break-words">{op.label}</p>
          <p className="type-caption text-text-secondary">
            {op.syncedAt
              ? `Synced ${at(op.syncedAt, timeZone)}`
              : `Recorded ${at(op.createdAt, timeZone)}`}
          </p>
        </div>
        {amount && <p className="type-body font-semibold money">{amount}</p>}
        <StatusBadge status={op.status} />
      </div>
      {op.message && <p className="type-body text-muted-foreground">{op.message}</p>}
      {op.status === "pending" && op.attempts > 0 && (
        <p className="type-body text-muted-foreground">
          Couldn’t get through yet. It’ll keep trying, and it can’t be saved twice.
        </p>
      )}
      <CompareVersions op={op} timeZone={timeZone} />
      {open && (
        <div className="flex flex-wrap gap-2">
          {op.status === "failed" && (
            <Button size="sm" onClick={retry}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          )}
          {canEdit(op) && <EditQueuedEntry op={op} />}
          {resolutionsFor(op).map((resolution, index) =>
            resolution.key === "discard" ? (
              <ConfirmDiscard key={resolution.key} op={op} resolution={resolution} />
            ) : (
              <Button
                key={resolution.key}
                size="sm"
                variant={index === 0 && op.status !== "failed" ? "default" : "outline"}
                onClick={() => resolve(resolution.key as ResolutionKey)}
              >
                {resolution.label}
              </Button>
            ),
          )}
        </div>
      )}
    </li>
  );
}

function Section({
  title,
  ops,
  currency,
  timeZone,
}: {
  title: string;
  ops: QueuedOp[];
  currency: CurrencyCode;
  timeZone: string;
}) {
  if (ops.length === 0) return null;
  return (
    <Surface asChild>
      <section aria-label={title}>
        <h2 className="type-heading">
          {title} <span className="type-body font-normal text-text-secondary">· {ops.length}</span>
        </h2>
        <ul className="flex flex-col divide-y">
          {ops.map((op) => (
            <OpRow key={op.seq} op={op} currency={currency} timeZone={timeZone} />
          ))}
        </ul>
      </section>
    </Surface>
  );
}

/** Everything on this device that isn't on the server yet, and what just got there. */
export function SyncCenter({ currency, timeZone }: { currency: CurrencyCode; timeZone: string }) {
  const { ops, waiting, stuck, signedOut, syncing, syncNow, lastSyncedAt } = useOffline();
  const online = useOnlineStatus();
  if (ops === null) return null;
  const unstuck = waiting.filter((op) => !stuck.includes(op));
  const synced = ops.filter((op) => op.status === "synced").reverse();

  return (
    <div className="flex flex-col gap-6" data-testid="sync-center">
      <Surface role="region" aria-labelledby="sync-status-title">
        <div className="flex flex-col gap-0.5">
          <h2 id="sync-status-title" className="type-heading">
            This device
          </h2>
          <p className="type-caption text-text-secondary" data-testid="sync-summary">
            {synced.length} synced · {unstuck.length} waiting · {stuck.length}{" "}
            {stuck.length === 1 ? "needs" : "need"} attention
          </p>
        </div>
        {waiting.length === 0 ? (
          <StatePanel
            size="section"
            icon={CheckCircle2}
            title="Everything on this device is on the server."
            description={
              lastSyncedAt
                ? `Last synced ${at(lastSyncedAt, timeZone)}.`
                : "Entries you save without a connection will appear here until they reach your account."
            }
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 flex-1 basis-56 type-body" role="status">
              {signedOut
                ? "You’ve been signed out. Sign in again to sync these."
                : online
                  ? `${waiting.length} not on your account yet.`
                  : `${waiting.length} waiting. They’ll sync once you’re back online.`}
            </p>
            <Button onClick={() => void syncNow()} disabled={!online || syncing}>
              {online ? (
                <RefreshCw className={syncing ? "animate-spin" : undefined} aria-hidden="true" />
              ) : (
                <CloudOff aria-hidden="true" />
              )}
              {syncing ? "Syncing…" : "Sync now"}
            </Button>
          </div>
        )}
      </Surface>
      <Section title="Needs your attention" ops={stuck} currency={currency} timeZone={timeZone} />
      <Section title="Waiting" ops={unstuck} currency={currency} timeZone={timeZone} />
      <Section title="Recently synced" ops={synced} currency={currency} timeZone={timeZone} />
    </div>
  );
}
