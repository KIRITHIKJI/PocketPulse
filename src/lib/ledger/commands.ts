/**
 * The single mutation layer for financial writes. Every create, edit, delete and undo — from
 * quick-add, the full form, repeat shortcuts, history and (Phase 10) the offline queue — is a
 * serialisable `LedgerCommand`:
 *
 * - `opId`: a client-generated UUID for the operation itself. A create sends it as the row's
 *   `idempotency_key`; the queue will store and replay commands by it.
 * - creates also carry the client-generated transaction `id`, so a retried or replayed create
 *   resolves to the same row (`duplicate`), never a second one.
 * - edits quote the row `version` they were based on (optimistic concurrency → `conflict`).
 * - deletes are soft; `restore` undoes them. Repeating either is a harmless `duplicate`.
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
  })
  .superRefine((d, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
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
export type EntryDraftInput = z.input<typeof entryDraftSchema>;

/** Fields an edit may change. Type, ids and bookkeeping fields are immutable. */
export const EDITABLE_FIELDS = [
  "amountPaise",
  "occurredAt",
  "accountId",
  "fromAccountId",
  "toAccountId",
  "categoryId",
  "subcategoryId",
  "description",
  "merchant",
  "note",
  "tags",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

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

export const ledgerCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create"), opId, draft: entryDraftSchema }),
  z.object({
    kind: z.literal("update"),
    opId,
    id: z.uuid(),
    expectedVersion: z.number().int().positive(),
    patch: entryPatchSchema,
  }),
  z.object({ kind: z.literal("delete"), opId, id: z.uuid() }),
  z.object({ kind: z.literal("restore"), opId, id: z.uuid() }),
]);
export type LedgerCommand = z.output<typeof ledgerCommandSchema>;
export type LedgerCommandInput = z.input<typeof ledgerCommandSchema>;

// --- Command → database call ------------------------------------------------------------------

const SNAKE: Record<EditableField | "refundOfId", string> = {
  amountPaise: "amount_paise",
  occurredAt: "occurred_at",
  accountId: "account_id",
  fromAccountId: "from_account_id",
  toAccountId: "to_account_id",
  refundOfId: "refund_of_id",
  categoryId: "category_id",
  subcategoryId: "subcategory_id",
  description: "description",
  merchant: "merchant",
  note: "note",
  tags: "tags",
};

export interface RpcCall {
  fn: "create_transaction" | "update_transaction" | "set_transaction_deleted";
  args: Record<string, unknown>;
}

/** The one database RPC a command maps to. The owner always comes from the session, never here. */
export function toRpcCall(command: LedgerCommand): RpcCall {
  switch (command.kind) {
    case "create": {
      const d = command.draft;
      return {
        fn: "create_transaction",
        args: {
          p_tx: {
            id: d.id,
            idempotency_key: command.opId,
            type: d.type,
            amount_paise: d.amountPaise,
            currency: d.currency,
            occurred_at: d.occurredAt,
            account_id: d.accountId,
            from_account_id: d.fromAccountId,
            to_account_id: d.toAccountId,
            refund_of_id: d.refundOfId,
            category_id: d.categoryId,
            subcategory_id: d.subcategoryId,
            description: d.description,
            merchant: d.merchant,
            note: d.note,
            tags: d.tags,
            source: d.source,
          },
        },
      };
    }
    case "update":
      return {
        fn: "update_transaction",
        args: {
          p_id: command.id,
          p_expected_version: command.expectedVersion,
          p_patch: Object.fromEntries(
            Object.entries(command.patch).map(([key, value]) => [
              SNAKE[key as EditableField],
              value,
            ]),
          ),
        },
      };
    case "delete":
    case "restore":
      return {
        fn: "set_transaction_deleted",
        args: { p_id: command.id, p_deleted: command.kind === "delete" },
      };
  }
}

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
    case "delete":
      return { kind: "restore", opId: newOpId, id: command.id };
    case "restore":
      return { kind: "delete", opId: newOpId, id: command.id };
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
