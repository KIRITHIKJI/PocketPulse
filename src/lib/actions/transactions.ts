"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { totalXp } from "@/domain";
import { getProfile } from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { type FormState, invalid } from "@/lib/forms";
import { type LedgerCommand, ledgerCommandSchema } from "@/lib/ledger/commands";
import { executeLedgerCommand } from "@/lib/ledger/execute";
import { commandEntryId } from "@/lib/offline/ops";
import { type PlayerStatus, playerStatus } from "@/lib/rewards/feedback";
import { syncRewards } from "@/lib/rewards/sync";
import { commandFromForm, entryFormSchema, entryFormValues } from "@/lib/validation/transactions";

/** What every ledger write returns to the client: serialisable, no row contents beyond the id. */
export type CommandResult =
  | {
      ok: true;
      /** `queued`: kept on this device, waiting for a connection. Never sent by the server. */
      status: "applied" | "duplicate" | "queued";
      id: string | null;
      undo: LedgerCommand | null;
      /** After a delete or an undone batch: the progress once what it earned was taken back. */
      rewards?: PlayerStatus;
    }
  | { ok: false; status: "conflict" | "not_found" | "rejected" | "invalid"; message: string };

/** Balances, history, category totals and every other view are rebuilt from the ledger. */
function refreshViews() {
  revalidatePath("/", "layout");
}

/** Commands that can only take rewards away: their sync runs before the answer goes back. */
const REMOVES = new Set<LedgerCommand["kind"]>(["delete", "undo_batch"]);

/**
 * A delete (Undo of a save, or a delete from History) syncs rewards after the delete finishes and
 * before it answers, so the screen it re-renders never shows XP that was just taken back.
 * Anything else answers at once: the client then asks for its feedback (`syncRewardFeedback`),
 * which is also the sync, so rewards never slow down recording an expense.
 */
async function rewardsAfterRemoval(command: LedgerCommand): Promise<PlayerStatus | undefined> {
  if (!REMOVES.has(command.kind)) return undefined;
  try {
    const { state, streaks } = await syncRewards({ revoke: true });
    return playerStatus(totalXp(state.events), streaks.currentDaily, Date.now());
  } catch {
    // The next sync (any save, or opening Rewards) catches up; the delete itself is done.
    return undefined;
  }
}

async function run(command: LedgerCommand): Promise<CommandResult> {
  const { supabase } = await requireSession();
  const outcome = await executeLedgerCommand(supabase, command);
  if (!outcome.ok) return { ok: false, status: outcome.status, message: outcome.message };
  const rewards = await rewardsAfterRemoval(command);
  // An edit can move an entry off the day or week an award was for, so its sync may take that
  // back (a new entry's sync never does). After the answer, so editing stays quick.
  if (command.kind === "update") after(() => syncRewards({ revoke: true }).catch(() => undefined));
  refreshViews();
  return {
    ok: true,
    status: outcome.status,
    id: commandEntryId(command),
    undo: outcome.undo,
    ...(rewards ? { rewards } : {}),
  };
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
  const parsed = entryFormSchema({ timeZone: profile.timeZone, now: requestNow() }).safeParse(
    entryFormValues(formData),
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
