/**
 * Runs ledger commands against the database through a small port (read one row, call one RPC),
 * so the same logic serves the Supabase server client, the database tests and the offline sync
 * replay. Status mapping and undo construction live only here.
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
      /** Why, for a conflict: lets the sync screen offer the right way out. */
      reason?: string;
      /** The request never reached the database, so the same command can simply be sent again. */
      retryable?: boolean;
    };

const CONFLICT_MESSAGES: Record<string, string> = {
  stale_version: "This entry changed on another device. Reload to see the latest version.",
  different_content:
    "An entry with this id was already saved with different details. Reload and check your history.",
  id_in_use: "This entry id is already in use. Reload and try again.",
  already_paid: "This bill was already paid. Nothing new was saved.",
  entry_removed: "That entry was deleted after it was saved. Reload and record it again.",
  changed_since: "This entry changed on another device after you deleted it here.",
};

const NOT_FOUND = "That entry doesn’t exist any more.";

/** Batches are one database transaction: any failure rolls every entry back. */
const ROLLED_BACK: Partial<Record<LedgerCommand["kind"], string>> = {
  batch: "Nothing was saved.",
  undo_batch: "Nothing was removed.",
  goal_purchase: "Nothing was saved.",
  pay_commitment: "Nothing was saved.",
  confirm_recurring: "Nothing was saved.",
};

/** The one unique rule a ledger write can hit: an occurrence that already has an entry. */
const ALREADY_RECORDED = "This was already recorded, so the entry stays as it is.";

/** PostgreSQL always gives a code; a failed connection to it doesn't. */
function rejected(error: DbError, message = dbErrorMessage(error)): LedgerOutcome {
  return { ok: false, status: "rejected", message, record: null, retryable: !error.code };
}

export async function runLedgerCommandWith(
  port: LedgerPort,
  command: LedgerCommand,
  newOpId: () => string = () => crypto.randomUUID(),
): Promise<LedgerOutcome> {
  // An edit's undo restores the values it replaced, so read them first. A delete that quotes a
  // version is checked the same way: `set_transaction_deleted` has no version of its own.
  let before: LedgerRecord | null = null;
  if (command.kind === "update" || (command.kind === "delete" && command.expectedVersion)) {
    const { row, error } = await port.readRow(command.id);
    if (error) return rejected(error);
    if (!row) return { ok: false, status: "not_found", message: NOT_FOUND, record: null };
    before = rowToLedgerRecord(row);
    if (
      command.kind === "delete" &&
      !before.deletedAt &&
      before.version !== command.expectedVersion
    ) {
      const reason = "changed_since";
      const message = CONFLICT_MESSAGES[reason]!;
      return { ok: false, status: "conflict", message, record: before, reason };
    }
  }

  const { data, error } = await port.call(toRpcCall(command));
  if (error) {
    const message = dbErrorMessage(error, ALREADY_RECORDED);
    const rolledBack = ROLLED_BACK[command.kind];
    return rejected(error, rolledBack ? `${message} ${rolledBack}` : message);
  }

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
        ...(result.reason ? { reason: result.reason } : {}),
      };
  }
}
