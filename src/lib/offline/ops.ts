/**
 * What the queue needs to know about a ledger command without running it: a short description
 * for the screen, and which records it touches. Pure, so it's shared by the queue and its tests.
 */
import type { EntryDraft, LedgerCommand, LedgerRecord } from "@/lib/ledger/commands";

export type OpStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

/** A tile's "remember this amount". A preference, so it travels with the entry it came from. */
export type RememberAmount = { presetId: string; amountPaise: number };

export interface QueuedOp {
  /** Queue order. Lower numbers always go first. */
  seq?: number;
  opId: string;
  /** Whose entry this is. A queue is only ever sent by the account that wrote it. */
  ownerId: string;
  command: LedgerCommand;
  remember: RememberAmount | null;
  label: string;
  amountPaise: number | null;
  currency: string | null;
  /** Ids this operation reads or writes; a later operation on one of them waits for this one. */
  keys: string[];
  status: OpStatus;
  attempts: number;
  nextAttemptAt: number;
  claimedAt: number | null;
  message: string | null;
  conflictReason: string | null;
  /** The newest version on the server, shown beside the user's own when they conflict. */
  serverRecord: LedgerRecord | null;
  createdAt: number;
  syncedAt: number | null;
}

/** Every id a command depends on, so operations on the same record keep their order. */
export function commandKeys(command: LedgerCommand): string[] {
  const links = (d: EntryDraft) => [d.id, d.refundOfId].filter((id): id is string => id !== null);
  switch (command.kind) {
    case "create":
      return links(command.draft);
    case "batch":
      return [command.opId, ...command.drafts.flatMap(links)];
    case "undo_batch":
      return [command.batchId];
    case "update":
    case "delete":
    case "restore":
      return [command.id];
    case "goal_move":
      return [command.id, command.goalId];
    case "goal_purchase":
      return [...links(command.draft), command.releaseId, command.goalId];
    case "pay_commitment":
      return [...links(command.draft), command.commitmentId];
    case "confirm_recurring":
      return [...links(command.draft), command.templateId];
  }
}

const KIND_LABELS: Record<LedgerCommand["kind"], string> = {
  create: "New entry",
  batch: "New entries",
  undo_batch: "Undo of several entries",
  update: "Change to an entry",
  delete: "Deleted entry",
  restore: "Restored entry",
  goal_move: "Goal money",
  goal_purchase: "Goal purchase",
  pay_commitment: "Bill payment",
  confirm_recurring: "Recurring entry",
};

function draftOf(command: LedgerCommand): EntryDraft | null {
  return "draft" in command ? command.draft : null;
}

export function commandLabel(command: LedgerCommand): string {
  const draft = draftOf(command);
  if (draft) return draft.description ?? draft.merchant ?? KIND_LABELS[command.kind];
  if (command.kind === "update" && command.patch.description) return command.patch.description;
  if (command.kind === "batch") return `${command.drafts.length} entries`;
  return KIND_LABELS[command.kind];
}

export function commandAmount(command: LedgerCommand): {
  amountPaise: number | null;
  currency: string | null;
} {
  const draft = draftOf(command);
  if (draft) return { amountPaise: draft.amountPaise, currency: draft.currency };
  if (command.kind === "goal_move") return { amountPaise: command.amountPaise, currency: null };
  if (command.kind === "update") {
    return { amountPaise: command.patch.amountPaise ?? null, currency: null };
  }
  if (command.kind === "batch") {
    const total = command.drafts.reduce((sum, d) => sum + d.amountPaise, 0);
    return { amountPaise: total, currency: command.drafts[0]!.currency };
  }
  return { amountPaise: null, currency: null };
}

/** The entry a command writes, for results and highlights. */
export function commandEntryId(command: LedgerCommand): string | null {
  switch (command.kind) {
    case "batch":
    case "undo_batch":
      return null;
    case "create":
    case "goal_purchase":
    case "pay_commitment":
    case "confirm_recurring":
      return command.draft.id;
    default:
      return command.id;
  }
}
