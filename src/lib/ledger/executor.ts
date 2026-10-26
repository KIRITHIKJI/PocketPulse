/**
 * Runs ledger commands against the database through a small port (read one row, call one RPC),
 * so the same logic serves the Supabase server client today, the database tests, and the
 * Phase 10 sync replay. Status mapping and undo construction live only here.
 */
import { type DbError, dbErrorMessage } from "@/lib/data/errors";
import { rowToLedgerRecord } from "@/lib/data/mappers";
import {
  type CommandStatus,
  type LedgerCommand,
  type LedgerRecord,
  type RpcCall,
  inverseCommand,
  toRpcCall,
} from "@/lib/ledger/commands";

type Row = Record<string, unknown>;

export interface LedgerPort {
  /** The caller's own row by id (RLS-scoped), deleted rows included; null if not visible. */
  readRow(id: string): Promise<{ row: Row | null; error: DbError | null }>;
  call(call: RpcCall): Promise<{ data: unknown; error: DbError | null }>;
}

export type LedgerOutcome =
  | {
      ok: true;
      status: "applied" | "duplicate";
      record: LedgerRecord | null;
      /** The command that reverses this one (for the Undo button), if it can be reversed. */
      undo: LedgerCommand | null;
    }
  | {
      ok: false;
      status: "conflict" | "not_found" | "rejected";
      message: string;
      /** The current row, when the database returned it (e.g. the newer version on a conflict). */
      record: LedgerRecord | null;
    };

const CONFLICT_MESSAGES: Record<string, string> = {
  stale_version: "This entry changed on another device. Reload to see the latest version.",
  different_content:
    "An entry with this id was already saved with different details. Reload and check your history.",
  id_in_use: "This entry id is already in use. Reload and try again.",
};

const NOT_FOUND = "That entry doesn’t exist any more.";

export async function runLedgerCommandWith(
  port: LedgerPort,
  command: LedgerCommand,
  newOpId: () => string = () => crypto.randomUUID(),
): Promise<LedgerOutcome> {
  // An edit's undo restores the values it replaced, so read them first.
  let before: LedgerRecord | null = null;
  if (command.kind === "update") {
    const { row, error } = await port.readRow(command.id);
    if (error)
      return { ok: false, status: "rejected", message: dbErrorMessage(error), record: null };
    if (!row) return { ok: false, status: "not_found", message: NOT_FOUND, record: null };
    before = rowToLedgerRecord(row);
  }

  const { data, error } = await port.call(toRpcCall(command));
  if (error) return { ok: false, status: "rejected", message: dbErrorMessage(error), record: null };

  const result = data as { status: CommandStatus; reason?: string; transaction?: Row };
  const record = result.transaction ? rowToLedgerRecord(result.transaction) : null;

  switch (result.status) {
    case "applied":
      return {
        ok: true,
        status: "applied",
        record,
        undo: inverseCommand(command, before, record, newOpId()),
      };
    case "duplicate":
      // A replay of something already done. An unchanged edit has nothing to undo.
      return {
        ok: true,
        status: "duplicate",
        record,
        undo: command.kind === "update" ? null : inverseCommand(command, before, record, newOpId()),
      };
    case "not_found":
      return { ok: false, status: "not_found", message: NOT_FOUND, record: null };
    case "conflict":
      return {
        ok: false,
        status: "conflict",
        message:
          CONFLICT_MESSAGES[result.reason ?? ""] ??
          "This entry conflicts with one already saved. Reload and try again.",
        record,
      };
  }
}
