/**
 * The durable offline queue: every operation that couldn't reach the server waits in IndexedDB
 * until it does. Nothing here decides whether an entry is valid; the server does that when the
 * operation arrives. What this guarantees:
 *
 * - An operation keeps its ids for life, so sending it twice is `duplicate` on the server. It
 *   leaves the queue only when the server has answered, or when the user discards it.
 * - Operations on the same record go in order. One that's stuck holds back later ones on that
 *   record, and never the rest.
 * - A claim is atomic and expires, so two tabs don't race and a closed tab can't strand an entry.
 *   If it does get sent twice, ids make that harmless.
 */
import Dexie, { type EntityTable } from "dexie";

import type { LedgerCommand, LedgerRecord } from "@/lib/ledger/commands";
import {
  type QueuedOp,
  type RememberAmount,
  commandAmount,
  commandKeys,
  commandLabel,
} from "@/lib/offline/ops";

const DB_NAME = "pocketpulse-offline";
/** A send that hasn't answered by now was lost with its tab. */
const CLAIM_TTL_MS = 60_000;
const FIRST_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;
/** Enough history to see what just synced. Older synced rows are only clutter. */
const KEEP_SYNCED = 20;

class OfflineDb extends Dexie {
  ops!: EntityTable<QueuedOp, "seq">;
  constructor() {
    super(DB_NAME);
    this.version(1).stores({ ops: "++seq, &opId, ownerId, status" });
  }
}

let db: OfflineDb | null = null;
export function offlineDb(): OfflineDb {
  db ??= new OfflineDb();
  return db;
}

export interface EnqueueOptions {
  label?: string | undefined;
  remember?: RememberAmount | null | undefined;
}

function newOp(
  ownerId: string,
  command: LedgerCommand,
  options: EnqueueOptions,
  now: number,
): QueuedOp {
  return {
    opId: command.opId,
    ownerId,
    command,
    remember: options.remember ?? null,
    label: options.label ?? commandLabel(command),
    ...commandAmount(command),
    keys: commandKeys(command),
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    claimedAt: null,
    message: null,
    conflictReason: null,
    serverRecord: null,
    createdAt: now,
    syncedAt: null,
  };
}

/** Queues an operation. Queuing the same `opId` again (a double tap) returns the first one. */
export async function enqueue(
  ownerId: string,
  command: LedgerCommand,
  options: EnqueueOptions = {},
  now = Date.now(),
): Promise<QueuedOp> {
  const { ops } = offlineDb();
  return offlineDb().transaction("rw", ops, async () => {
    const existing = await ops.where("opId").equals(command.opId).first();
    if (existing) return existing;
    const op = newOp(ownerId, command, options, now);
    const seq = await ops.add(op);
    return { ...op, seq };
  });
}

/** Oldest first. Only this account's operations: another account's are never shown or sent. */
export function listOps(ownerId: string): Promise<QueuedOp[]> {
  return offlineDb().ops.where("ownerId").equals(ownerId).sortBy("seq");
}

/** Takes the next operation that's due and free to go, marking it as being sent. */
export async function claimNext(
  ownerId: string,
  now = Date.now(),
  { force = false }: { force?: boolean } = {},
): Promise<QueuedOp | null> {
  const { ops } = offlineDb();
  return offlineDb().transaction("rw", ops, async () => {
    const queued = await ops.where("ownerId").equals(ownerId).sortBy("seq");
    const held = new Set<string>();
    for (const op of queued) {
      if (op.status === "synced") continue;
      const expired = op.status === "syncing" && now - (op.claimedAt ?? 0) >= CLAIM_TTL_MS;
      const free = !op.keys.some((key) => held.has(key));
      if ((op.status === "pending" || expired) && free && (force || op.nextAttemptAt <= now)) {
        await ops.update(op.seq!, { status: "syncing", claimedAt: now });
        return { ...op, status: "syncing", claimedAt: now };
      }
      for (const key of op.keys) held.add(key);
    }
    return null;
  });
}

export type SendResult =
  | { kind: "synced" }
  /** Unreachable, or the server couldn't answer. The same operation goes again later. */
  | { kind: "retry" }
  /** The session ended. Nothing is wrong with the entry: it waits for a sign-in. */
  | { kind: "signed_out" }
  | { kind: "failed"; message: string }
  | { kind: "conflict"; message: string; reason: string | null; record: LedgerRecord | null };

export function retryDelay(attempts: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);
}

async function settle(op: QueuedOp, result: SendResult, now: number) {
  const { ops } = offlineDb();
  const attempts = op.attempts + 1;
  switch (result.kind) {
    case "synced":
      await ops.update(op.seq!, {
        status: "synced",
        attempts,
        syncedAt: now,
        claimedAt: null,
        message: null,
        conflictReason: null,
        serverRecord: null,
      });
      return;
    case "retry":
      await ops.update(op.seq!, {
        status: "pending",
        attempts,
        claimedAt: null,
        nextAttemptAt: now + retryDelay(attempts),
      });
      return;
    case "signed_out":
      await ops.update(op.seq!, { status: "pending", claimedAt: null });
      return;
    case "failed":
      await ops.update(op.seq!, {
        status: "failed",
        attempts,
        claimedAt: null,
        message: result.message,
      });
      return;
    case "conflict":
      await ops.update(op.seq!, {
        status: "conflict",
        attempts,
        claimedAt: null,
        message: result.message,
        conflictReason: result.reason,
        serverRecord: result.record,
      });
  }
}

export interface FlushResult {
  synced: number;
  /** Why sending stopped early. A conflict or a refused entry doesn't stop the others. */
  stopped: "unreachable" | "signed_out" | null;
}

async function pruneSynced(ownerId: string) {
  const all = await listOps(ownerId);
  const synced = all.filter((op) => op.status === "synced");
  const old = synced.slice(0, Math.max(0, synced.length - KEEP_SYNCED)).map((op) => op.seq!);
  if (old.length > 0) await offlineDb().ops.bulkDelete(old);
}

/** Sends everything that's due, in order, until the queue is done or the server can't be reached. */
export async function flushQueue(
  ownerId: string,
  send: (op: QueuedOp) => Promise<SendResult>,
  options: { force?: boolean; now?: () => number } = {},
): Promise<FlushResult> {
  const now = options.now ?? Date.now;
  let synced = 0;
  for (;;) {
    const op = await claimNext(ownerId, now(), options);
    if (!op) break;
    let result: SendResult;
    try {
      result = await send(op);
    } catch {
      result = { kind: "retry" };
    }
    await settle(op, result, now());
    if (result.kind === "synced") synced += 1;
    if (result.kind === "retry") return { synced, stopped: "unreachable" };
    if (result.kind === "signed_out") return { synced, stopped: "signed_out" };
  }
  await pruneSynced(ownerId);
  return { synced, stopped: null };
}

/** Sends a stuck operation again, with the same ids. */
export async function retryOp(opId: string): Promise<void> {
  await offlineDb()
    .ops.where("opId")
    .equals(opId)
    .modify((op) => {
      if (op.status !== "failed" && op.status !== "conflict" && op.status !== "pending") return;
      op.status = "pending";
      op.nextAttemptAt = 0;
      op.message = null;
      op.conflictReason = null;
      op.serverRecord = null;
    });
}

/**
 * Removes an operation that hasn't gone anywhere. False when it's being sent, has landed, or was
 * sent without an answer and so may have landed: then the server's copy has to be undone instead.
 */
export async function discardOp(opId: string): Promise<boolean> {
  const { ops } = offlineDb();
  return offlineDb().transaction("rw", ops, async () => {
    const op = await ops.where("opId").equals(opId).first();
    if (!op) return true;
    const maybeSent = op.status === "pending" && op.attempts > 0;
    if (op.status === "syncing" || op.status === "synced" || maybeSent) return false;
    await ops.delete(op.seq!);
    return true;
  });
}

/**
 * Replaces a stuck or waiting operation with what the user chose instead, in its place in the
 * queue, so nothing queued after it overtakes it. Later commands go right behind it by key order.
 */
export async function replaceOp(
  opId: string,
  command: LedgerCommand,
  options: EnqueueOptions = {},
  then: readonly LedgerCommand[] = [],
): Promise<void> {
  const { ops } = offlineDb();
  await offlineDb().transaction("rw", ops, async () => {
    const op = await ops.where("opId").equals(opId).first();
    if (!op || op.status === "syncing" || op.status === "synced") return;
    const { ownerId, seq, createdAt, remember } = op;
    await ops.put({
      ...newOp(ownerId, command, { label: options.label, remember }, createdAt),
      seq: seq!,
    });
    for (const next of then) await ops.add(newOp(ownerId, next, { label: op.label }, createdAt));
  });
}

/** Clears an account's queue. Only for an account that no longer exists. */
export async function forgetOwner(ownerId: string): Promise<void> {
  await offlineDb().ops.where("ownerId").equals(ownerId).delete();
}
