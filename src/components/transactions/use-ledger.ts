"use client";

import * as React from "react";

import { useToast } from "@/components/feedback/toast";
import { useOffline } from "@/components/offline/offline-provider";
import { type CommandResult, runLedgerCommand } from "@/lib/actions/transactions";
import { type LedgerCommand, inverseCommand } from "@/lib/ledger/commands";
import { newId } from "@/lib/ids";
import { type RememberAmount, commandEntryId } from "@/lib/offline/ops";
import { savePagesSoon } from "@/lib/offline/pwa";
import { loadQueue } from "@/lib/offline/load-queue";

const UNDONE: Record<LedgerCommand["kind"], string> = {
  create: "Undone.",
  update: "Change undone.",
  delete: "Undone — the entry is removed again.",
  restore: "Restored.",
  batch: "Undone.",
  undo_batch: "Undone — those entries are removed.",
  goal_move: "Undone.",
  goal_purchase: "Undone.",
  pay_commitment: "Undone.",
  confirm_recurring: "Undone.",
};

const UNREACHABLE = "Couldn’t reach PocketPulse. Check your connection and try again.";
const QUEUED = "Saved on this device. It’ll sync when you’re back online.";
const NOT_QUEUED = "Couldn’t save this on your device, so nothing was recorded. Try again.";

/** A save that takes this long goes to the queue, so a bad connection never holds up an entry. */
const SAVE_TIMEOUT_MS = 15_000;

/** Rejects if `work` takes too long. It may still land: the queue's replay is then a `duplicate`. */
export function withSaveTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), SAVE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Client side of the mutation layer: sends a command once (a second tap while the first is in
 * flight is ignored; a retry after that replays the same ids and the server answers
 * `duplicate`), then shows the result with an Undo that runs the inverse command.
 *
 * Without a connection, or if the send fails partway, the same command goes into the offline
 * queue. A send that failed may still have landed; the ids make the replay harmless either way.
 */
export function useLedger() {
  const { show, setHighlightId } = useToast();
  const { enqueue, mustFollowQueue } = useOffline();
  const inFlight = React.useRef(new Set<string>());

  const undo = React.useCallback(
    async function undo(command: LedgerCommand): Promise<void> {
      if (!navigator.onLine) {
        await enqueue(command);
        show({
          tone: "success",
          message: "Undo saved on this device. It’ll sync when you’re back.",
        });
        return;
      }
      let result: CommandResult;
      try {
        result = await runLedgerCommand(command);
      } catch {
        result = { ok: false, status: "rejected", message: UNREACHABLE };
      }
      if (result.ok) show({ tone: "success", message: UNDONE[command.kind] });
      // Undo is idempotent, so a failed one stays on offer: retrying can't undo twice.
      else
        show({
          tone: "error",
          message: result.message,
          action: { label: "Undo", run: () => undo(command) },
        });
    },
    [show, enqueue],
  );

  /** Undo of something still in the queue: it never needs to reach the server at all. */
  const cancelQueued = React.useCallback(
    async (command: LedgerCommand) => {
      if (await (await loadQueue()).discardOp(command.opId)) {
        show({ tone: "success", message: "Removed. It was never sent." });
        return;
      }
      const reverse = inverseCommand(command, null, null, newId());
      if (reverse) await undo(reverse);
      else show({ tone: "error", message: "This already synced. Change it from History." });
    },
    [show, undo],
  );

  const queue = React.useCallback(
    async (
      command: LedgerCommand,
      options: { label?: string; remember?: RememberAmount | null; message?: string } = {},
    ): Promise<CommandResult> => {
      try {
        await enqueue(command, { label: options.label, remember: options.remember });
      } catch {
        show({ tone: "error", message: NOT_QUEUED });
        return { ok: false, status: "rejected", message: NOT_QUEUED };
      }
      show({
        tone: "success",
        message: options.message ?? QUEUED,
        action: { label: "Undo", run: () => cancelQueued(command) },
      });
      return { ok: true, status: "queued", id: commandEntryId(command), undo: null };
    },
    [enqueue, show, cancelQueued],
  );

  const run = React.useCallback(
    async (
      command: LedgerCommand,
      options: {
        success: string;
        send?: (command: LedgerCommand) => Promise<CommandResult>;
        /** How the queue lists this if it can't be sent now. */
        label?: string;
        remember?: RememberAmount | null;
        /** A frequent one-tap save: a compact toast once it repeats, and a shorter Undo. */
        routine?: boolean;
        undoMs?: number;
      },
    ): Promise<CommandResult | null> => {
      if (inFlight.current.has(command.opId)) return null;
      inFlight.current.add(command.opId);
      try {
        const queueIt = () => queue(command, options);
        if (!navigator.onLine || mustFollowQueue(command)) return await queueIt();
        let result: CommandResult;
        try {
          result = await withSaveTimeout((options.send ?? runLedgerCommand)(command));
        } catch {
          return await queueIt();
        }
        if (!result.ok) {
          show({ tone: "error", message: result.message });
          return result;
        }
        savePagesSoon();
        if (command.kind === "create") setHighlightId(command.draft.id);
        if (command.kind === "batch") setHighlightId(command.drafts[0]!.id);
        const reverse = result.undo;
        show({
          tone: "success",
          message:
            result.status === "duplicate" && command.kind !== "update"
              ? "Already saved — no duplicate was added."
              : options.success,
          action: reverse ? { label: "Undo", run: () => undo(reverse) } : undefined,
          routine: options.routine,
          durationMs: options.undoMs,
        });
        return result;
      } finally {
        inFlight.current.delete(command.opId);
      }
    },
    [show, setHighlightId, undo, queue, mustFollowQueue],
  );

  return { run, undo, queue, cancelQueued };
}
