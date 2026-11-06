/** A validated ledger command → the one database RPC (and payload) that performs it. */

import { type EditableField, type EntryDraft, type LedgerCommand } from "./commands";

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
  fn:
    | "create_transaction"
    | "log_transactions_batch"
    | "undo_transactions_batch"
    | "move_goal_money"
    | "record_goal_purchase"
    | "pay_commitment"
    | "confirm_recurring"
    | "update_transaction"
    | "set_transaction_deleted";
  args: Record<string, unknown>;
}

function draftRow(d: EntryDraft, idempotencyKey: string) {
  return {
    id: d.id,
    idempotency_key: idempotencyKey,
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
    preset_id: d.presetId,
  };
}

/** The one database RPC a command maps to. The owner always comes from the session, never here. */
export function toRpcCall(command: LedgerCommand): RpcCall {
  switch (command.kind) {
    case "create":
      return {
        fn: "create_transaction",
        args: { p_tx: draftRow(command.draft, command.opId) },
      };
    case "batch":
      return {
        fn: "log_transactions_batch",
        args: {
          p_batch_id: command.opId,
          p_items: command.drafts.map((d) => draftRow(d, d.id)),
        },
      };
    case "undo_batch":
      return {
        fn: "undo_transactions_batch",
        args: { p_op_id: command.opId, p_batch_id: command.batchId },
      };
    case "goal_move":
      return {
        fn: "move_goal_money",
        args: {
          p_id: command.id,
          p_goal_id: command.goalId,
          p_type: command.moveType,
          p_amount_paise: command.amountPaise,
          p_occurred_at: command.occurredAt,
          p_note: command.note,
        },
      };
    case "goal_purchase":
      return {
        fn: "record_goal_purchase",
        args: {
          p_expense: draftRow(command.draft, command.opId),
          p_release_id: command.releaseId,
          p_goal_id: command.goalId,
        },
      };
    case "pay_commitment":
      return {
        fn: "pay_commitment",
        args: {
          p_commitment_id: command.commitmentId,
          p_expense: draftRow(command.draft, command.opId),
        },
      };
    case "confirm_recurring":
      return {
        fn: "confirm_recurring",
        args: {
          p_template_id: command.templateId,
          p_occurrence: command.occurrence,
          p_tx: draftRow(command.draft, command.opId),
        },
      };
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
