/**
 * The single mutation layer for financial writes. Every create, edit, delete and undo — from
 * quick-add, the full form, repeat shortcuts, history and the offline queue — is a serialisable `LedgerCommand`:
 *
 * - `opId`: a client-generated UUID for the operation itself. A create sends it as the row's
 *   `idempotency_key`; the queue will store and replay commands by it.
 * - creates also carry the client-generated transaction `id`, so a retried or replayed create
 *   resolves to the same row (`duplicate`), never a second one.
 * - edits quote the row `version` they were based on (optimistic concurrency → `conflict`).
 * - deletes are soft; `restore` undoes them. Repeating either is a harmless `duplicate`. A delete
 *   queued offline quotes the version it saw, so it can't silently remove a newer edit.
 * - `batch` logs several reviewed drafts all-or-nothing; `opId` is the batch id and each draft
 *   keeps its own id, so replaying the batch can't double anything. `undo_batch` is its undo:
 *   every entry of the batch goes or none does, and replaying it (same `opId`) changes nothing.
 * - `goal_move` sets money aside for a goal or releases it. It's an earmark, never spending.
 * - `goal_purchase` records a real expense and releases the earmark in one database transaction;
 *   its undo is `undo_batch` on the same id, so the two come back together too.
 * - `pay_commitment` and `confirm_recurring` record the real entry and clear what was planned in
 *   the same save, so it's never subtracted as both.
 *
 * Commands are plain JSON, validated with Zod at every boundary, and turned into exactly one
 * database RPC call by `toRpcCall`. This module is pure (client, server and tests share it).
 */
import { z } from "zod";

import {
  TRANSACTION_SOURCES,
  type Transaction,
  amountPaiseSchema,
  currencySchema,
  isoDateTimeSchema,
  localDateSchema,
} from "@/domain";

/** Entry types the user records directly (allocations/releases go through goal screens). */
export const ENTRY_TYPES = ["expense", "income", "refund", "transfer"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export function isEntryType(type: string): type is EntryType {
  return (ENTRY_TYPES as readonly string[]).includes(type);
}

const nullableId = z.uuid().nullable().default(null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null)
    .transform((v) => (v === "" ? null : v));
const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(20).default([]);

/** A new entry, exactly as the client created it (ids included). */
export const entryDraftSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(ENTRY_TYPES),
    amountPaise: amountPaiseSchema,
    currency: currencySchema.default("INR"),
    occurredAt: isoDateTimeSchema,
    accountId: nullableId,
    fromAccountId: nullableId,
    toAccountId: nullableId,
    refundOfId: nullableId,
    categoryId: nullableId,
    subcategoryId: nullableId,
    description: optionalText(200),
    merchant: optionalText(120),
    note: optionalText(1000),
    tags: tagsSchema,
    source: z.enum(TRANSACTION_SOURCES).default("manual"),
    presetId: nullableId,
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (d.presetId && d.type !== "expense") issue("presetId", "Only expenses come from a tile.");
    if (d.type === "transfer") {
      if (!d.fromAccountId) issue("fromAccountId", "Choose the wallet the money leaves.");
      if (!d.toAccountId) issue("toAccountId", "Choose the wallet the money goes to.");
      if (d.fromAccountId && d.fromAccountId === d.toAccountId) {
        issue("toAccountId", "Choose two different wallets.");
      }
      if (d.accountId || d.categoryId || d.subcategoryId || d.refundOfId) {
        issue("type", "A transfer only moves money between your wallets.");
      }
      return;
    }
    if (!d.accountId) issue("accountId", "Choose a wallet.");
    if (d.fromAccountId || d.toAccountId) issue("type", "Only transfers use two wallets.");
    if (d.type === "refund" && !d.refundOfId) issue("refundOfId", "Choose the expense it refunds.");
    if (d.type !== "refund" && d.refundOfId)
      issue("refundOfId", "Only refunds link to an expense.");
    if (d.subcategoryId && !d.categoryId)
      issue("subcategoryId", "A subcategory needs its category.");
  });
export type EntryDraft = z.output<typeof entryDraftSchema>;

/** Fields an edit may change. Type, ids and bookkeeping fields are immutable. */
export type EditableField =
  | "amountPaise"
  | "occurredAt"
  | "accountId"
  | "fromAccountId"
  | "toAccountId"
  | "categoryId"
  | "subcategoryId"
  | "description"
  | "merchant"
  | "note"
  | "tags";

export const entryPatchSchema = z
  .object({
    amountPaise: amountPaiseSchema,
    occurredAt: isoDateTimeSchema,
    accountId: z.uuid().nullable(),
    fromAccountId: z.uuid().nullable(),
    toAccountId: z.uuid().nullable(),
    categoryId: z.uuid().nullable(),
    subcategoryId: z.uuid().nullable(),
    description: z.string().trim().max(200).nullable(),
    merchant: z.string().trim().max(120).nullable(),
    note: z.string().trim().max(1000).nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
  })
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, "Nothing to change.");
export type EntryPatch = z.output<typeof entryPatchSchema>;

const opId = z.uuid();

/** The most entries one confirmation can save (`log_transactions_batch` enforces it too). */
export const MAX_BATCH_SIZE = 50;

const expenseDraftSchema = entryDraftSchema.refine(
  (d) => d.type === "expense",
  "This records an expense.",
);
const incomeOrExpenseDraftSchema = entryDraftSchema.refine(
  (d) => d.type === "expense" || d.type === "income",
  "This records income or an expense.",
);

export const ledgerCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), opId, draft: entryDraftSchema }),
  z.object({
    kind: z.literal("update"),
    opId,
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    patch: entryPatchSchema,
  }),
  z.object({
    kind: z.literal("delete"),
    opId,
    id: z.uuid(),
    expectedVersion: z.number().int().positive().optional(),
  }),
  z.object({ kind: z.literal("restore"), opId, id: z.uuid() }),
  z.object({
    kind: z.literal("batch"),
    opId,
    drafts: z
      .array(entryDraftSchema)
      .min(1)
      .max(MAX_BATCH_SIZE)
      .superRefine((drafts, ctx) => {
        if (drafts.some((d) => d.type !== "expense" && d.type !== "income")) {
          ctx.addIssue({ code: "custom", message: "A batch holds only expenses and income." });
        }
        if (new Set(drafts.map((d) => d.id)).size !== drafts.length) {
          ctx.addIssue({ code: "custom", message: "Every draft needs its own id." });
        }
      }),
  }),
  z.object({ kind: z.literal("undo_batch"), opId, batchId: z.uuid() }),
  z.object({
    kind: z.literal("goal_move"),
    opId,
    id: z.uuid(),
    goalId: z.uuid(),
    moveType: z.enum(["allocation", "allocation_release"]),
    amountPaise: amountPaiseSchema,
    occurredAt: isoDateTimeSchema,
    note: optionalText(1000),
  }),
  z.object({
    kind: z.literal("goal_purchase"),
    opId,
    goalId: z.uuid(),
    /** The release row's id, and the batch id both rows share. */
    releaseId: z.uuid(),
    draft: expenseDraftSchema,
  }),
  z.object({
    kind: z.literal("pay_commitment"),
    opId,
    commitmentId: z.uuid(),
    draft: expenseDraftSchema,
  }),
  z.object({
    kind: z.literal("confirm_recurring"),
    opId,
    templateId: z.uuid(),
    occurrence: localDateSchema,
    draft: incomeOrExpenseDraftSchema,
  }),
]);
export type LedgerCommand = z.output<typeof ledgerCommandSchema>;

// --- Results and undo -----------------------------------------------------------------------

/** A ledger row as the app sees it: the domain record plus its concurrency version. */
export type LedgerRecord = Transaction & { version: number };

export type CommandStatus = "applied" | "duplicate" | "conflict" | "not_found";

/** The value of an editable field on a record (null when the type doesn't have it). */
function fieldOf(record: LedgerRecord, field: EditableField): unknown {
  const value = (record as Record<string, unknown>)[field];
  return value === undefined ? null : value;
}

/**
 * The command that reverses `command`, given the row before and after it ran. Undo is itself
 * an ordinary command (new opId), so it is idempotent and conflict-checked like any other.
 */
export function inverseCommand(
  command: LedgerCommand,
  before: LedgerRecord | null,
  after: LedgerRecord | null,
  newOpId: string,
): LedgerCommand | null {
  switch (command.kind) {
    case "create":
      return { kind: "delete", opId: newOpId, id: command.draft.id };
    case "batch":
      return { kind: "undo_batch", opId: newOpId, batchId: command.opId };
    case "undo_batch":
      return null;
    case "delete":
      return { kind: "restore", opId: newOpId, id: command.id };
    case "restore":
      return { kind: "delete", opId: newOpId, id: command.id };
    case "goal_move":
      return { kind: "delete", opId: newOpId, id: command.id };
    case "goal_purchase":
      return { kind: "undo_batch", opId: newOpId, batchId: command.releaseId };
    case "pay_commitment":
      return { kind: "delete", opId: newOpId, id: command.draft.id };
    case "confirm_recurring":
      // On a retry from another device the entry that exists is that device's, not this draft.
      return { kind: "delete", opId: newOpId, id: after?.id ?? command.draft.id };
    case "update": {
      if (!before || !after) return null;
      const patch = Object.fromEntries(
        Object.keys(command.patch).map((key) => [key, fieldOf(before, key as EditableField)]),
      );
      return {
        kind: "update",
        opId: newOpId,
        id: command.id,
        expectedVersion: after.version,
        patch: patch as EntryPatch,
      };
    }
  }
}
