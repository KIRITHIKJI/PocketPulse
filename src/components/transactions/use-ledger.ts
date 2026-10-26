"use client";

import * as React from "react";

import { useToast } from "@/components/feedback/toast";
import { type CommandResult, runLedgerCommand } from "@/lib/actions/transactions";
import type { LedgerCommand } from "@/lib/ledger/commands";

const UNDONE: Record<LedgerCommand["kind"], string> = {
  create: "Undone.",
  update: "Change undone.",
  delete: "Undone — the entry is removed again.",
  restore: "Restored.",
};

/**
 * Client side of the mutation layer: sends a command once (a second tap while the first is in
 * flight is ignored; a retry after that replays the same ids and the server answers
 * `duplicate`), then shows the result with an Undo that runs the inverse command.
 */
export function useLedger() {
  const { show, setHighlightId } = useToast();
  const inFlight = React.useRef(new Set<string>());

  const undo = React.useCallback(
    async (command: LedgerCommand) => {
      const result = await runLedgerCommand(command);
      if (result.ok) show({ tone: "success", message: UNDONE[command.kind] });
      else show({ tone: "error", message: result.message });
    },
    [show],
  );

  const run = React.useCallback(
    async (
      command: LedgerCommand,
      options: {
        success: string;
        send?: (command: LedgerCommand) => Promise<CommandResult>;
      },
    ): Promise<CommandResult | null> => {
      if (inFlight.current.has(command.opId)) return null;
      inFlight.current.add(command.opId);
      try {
        let result: CommandResult;
        try {
          result = await (options.send ?? runLedgerCommand)(command);
        } catch {
          result = {
            ok: false,
            status: "rejected",
            message: "Couldn’t reach PocketPulse. Check your connection and try again.",
          };
        }
        if (!result.ok) {
          show({ tone: "error", message: result.message });
          return result;
        }
        if (command.kind === "create") setHighlightId(command.draft.id);
        const reverse = result.undo;
        show({
          tone: "success",
          message:
            result.status === "duplicate" && command.kind === "create"
              ? "Already saved — no duplicate was added."
              : options.success,
          action: reverse ? { label: "Undo", run: () => undo(reverse) } : undefined,
        });
        return result;
      } finally {
        inFlight.current.delete(command.opId);
      }
    },
    [show, setHighlightId, undo],
  );

  return { run, undo };
}
