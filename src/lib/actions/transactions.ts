"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProfile } from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { executeLedgerCommand } from "@/lib/ledger/execute";
import { commandFromForm, entryFormSchema } from "@/lib/validation/transactions";

/** What every ledger write returns to the client: serialisable, no row contents beyond the id. */
export type CommandResult =
  | {
      ok: true;
      status: "applied" | "duplicate";
      id: string | null;
      undo: LedgerCommand | null;
    }
  | { ok: false; status: "conflict" | "not_found" | "rejected" | "invalid"; message: string };

/** Balances, history, category totals and every other view are rebuilt from the ledger. */
function refreshViews() {
  revalidatePath("/", "layout");
}

async function run(command: LedgerCommand): Promise<CommandResult> {
  const { supabase } = await requireSession();
  const outcome = await executeLedgerCommand(supabase, command);
  if (!outcome.ok) return { ok: false, status: outcome.status, message: outcome.message };
  refreshViews();
  const id = command.kind === "create" ? command.draft.id : command.id;
  return { ok: true, status: outcome.status, id, undo: outcome.undo };
}

/**
 * The entry point for quick-add, repeat, delete and undo. The command arrives from the client
 * already carrying its ids, so a double tap or a retry replays the same operation.
 */
export async function runLedgerCommand(input: unknown): Promise<CommandResult> {
  const parsed = ledgerCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: "invalid", message: "That entry isn’t valid. Check the amount." };
  }
  return run(parsed.data);
}

const presetAmountSchema = z.object({
  presetId: z.uuid(),
  amountPaise: z.number().int().positive().max(999_999_999_999),
});

/**
 * Quick-add: records the entry, then (if asked) remembers the amount as the tile's usual one.
 * The tile update is a preference, not money — it never runs unless the entry was saved.
 */
export async function saveQuickAdd(
  input: unknown,
  remember: unknown,
): Promise<CommandResult & { rememberFailed?: boolean }> {
  const result = await runLedgerCommand(input);
  if (!result.ok || remember === null || remember === undefined) return result;
  const parsed = presetAmountSchema.safeParse(remember);
  if (!parsed.success) return { ...result, rememberFailed: true };
  const { supabase } = await requireSession();
  const { error } = await supabase
    .from("quick_add_presets")
    .update({ amount_paise: parsed.data.amountPaise })
    .eq("id", parsed.data.presetId);
  return error ? { ...result, rememberFailed: true } : result;
}

export type EntryFormState = FormState & { result?: CommandResult };

/** The full form (create and edit). Validation errors keep what was typed. */
export async function saveEntryForm(
  _prev: EntryFormState,
  formData: FormData,
): Promise<EntryFormState> {
  const profile = await getProfile();
  const fields = [
    "mode",
    "id",
    "opId",
    "version",
    "type",
    "amount",
    "categoryId",
    "subcategoryId",
    "accountId",
    "fromAccountId",
    "toAccountId",
    "refundOfId",
    "date",
    "time",
    "description",
    "merchant",
    "note",
    "tags",
  ] as const;
  const parsed = entryFormSchema({ timeZone: profile.timeZone, now: requestNow() }).safeParse(
    Object.fromEntries(fields.map((f) => [f, text(formData, f)])),
  );
  if (!parsed.success) return invalid(parsed.error);

  const result = await run(commandFromForm(parsed.data, profile.currency));
  if (!result.ok) return { status: "error", message: result.message, result };
  return {
    status: "success",
    message: parsed.data.mode === "edit" ? "Changes saved." : "Saved.",
    savedAt: Date.now(),
    result,
  };
}
