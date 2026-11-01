/**
 * The ways out of a real conflict. Each choice is explicit and keeps the user's data: nothing is
 * overwritten or dropped until they pick. Pure: it only says which commands a choice stands for.
 */
import { newId } from "@/lib/ids";
import type { EntryDraft, LedgerCommand } from "@/lib/ledger/commands";
import type { QueuedOp } from "@/lib/offline/ops";

export type ResolutionKey = "keep_mine" | "restore_with_mine" | "delete_anyway" | "save_separately";

export interface Resolution {
  key: ResolutionKey | "discard";
  label: string;
}

const DISCARD: Partial<Record<LedgerCommand["kind"], string>> = {
  update: "Keep the latest version",
  delete: "Keep the entry",
};

/** Entries a stuck command would have written, for saving them as new ones. */
function draftsOf(command: LedgerCommand): EntryDraft[] {
  if (command.kind === "batch") return command.drafts;
  return "draft" in command ? [command.draft] : [];
}

/** What the user can do about this operation. The last choice is always to drop it. */
export function resolutionsFor(op: QueuedOp): Resolution[] {
  const { command, serverRecord } = op;
  const discard: Resolution = { key: "discard", label: DISCARD[command.kind] ?? "Discard mine" };
  if (op.status !== "conflict") return [discard];
  if (command.kind === "update" && serverRecord) {
    return serverRecord.deletedAt
      ? [{ key: "restore_with_mine", label: "Bring it back with my change" }, discard]
      : [{ key: "keep_mine", label: "Use my change" }, discard];
  }
  if (command.kind === "delete" && serverRecord) {
    return [{ key: "delete_anyway", label: "Delete it anyway" }, discard];
  }
  if (draftsOf(command).length > 0) {
    return [{ key: "save_separately", label: "Save mine as a new entry" }, discard];
  }
  return [discard];
}

/** The command that replaces the stuck one, plus any that must follow it. */
export function resolutionCommands(
  op: QueuedOp,
  key: ResolutionKey,
): { command: LedgerCommand; then: LedgerCommand[] } | null {
  const { command, serverRecord } = op;
  const version = serverRecord?.version;
  if (key === "keep_mine" && command.kind === "update" && version) {
    return { command: { ...command, opId: newId(), expectedVersion: version }, then: [] };
  }
  if (key === "restore_with_mine" && command.kind === "update" && version) {
    // Restoring counts as a change, so the edit quotes the version the restore leaves.
    return {
      command: { kind: "restore", opId: newId(), id: command.id },
      then: [{ ...command, opId: newId(), expectedVersion: version + 1 }],
    };
  }
  if (key === "delete_anyway" && command.kind === "delete" && version) {
    return { command: { ...command, opId: newId(), expectedVersion: version }, then: [] };
  }
  if (key === "save_separately") {
    const [first, ...rest] = draftsOf(command).map((draft): LedgerCommand => ({
      kind: "create",
      opId: newId(),
      draft: { ...draft, id: newId() },
    }));
    return first ? { command: first, then: rest } : null;
  }
  return null;
}
