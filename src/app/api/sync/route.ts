import { revalidatePath } from "next/cache";
import { NextResponse, after } from "next/server";
import { z } from "zod";

import { optionalSession } from "@/lib/data/session";
import { ledgerCommandSchema } from "@/lib/ledger/commands";
import { executeLedgerCommand } from "@/lib/ledger/execute";
import { commandEntryId } from "@/lib/offline/ops";
import type { SyncResponse } from "@/lib/offline/transport";
import { syncRewards } from "@/lib/rewards/sync";

const bodySchema = z.object({
  command: ledgerCommandSchema,
  remember: z
    .object({
      presetId: z.uuid(),
      amountPaise: z.number().int().positive().max(999_999_999_999),
    })
    .nullable()
    .default(null),
});

const json = (body: SyncResponse | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "private, no-store" } });

/**
 * Where the offline queue sends each operation. It's a route rather than a server action so a
 * background send can't redirect the app or re-render the screen, and so a lost session is a
 * plain 401 the queue can wait out. A retry runs the same command: the database makes it safe.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "cross_origin" }, 403);
  }
  const session = await optionalSession();
  if (!session) return json({ error: "signed_out" }, 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ ok: false, status: "invalid", message: "This entry isn’t valid any more." });
  }
  const { command, remember } = parsed.data;
  const outcome = await executeLedgerCommand(session.supabase, command);
  if (!outcome.ok) {
    return json({
      ok: false,
      status: outcome.status,
      message: outcome.message,
      record: outcome.record,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.retryable ? { retryable: true } : {}),
    });
  }
  // The entry is saved at this point, so a failed preference mustn't report it as failed.
  if (remember) {
    await session.supabase
      .from("quick_add_presets")
      .update({ amount_paise: remember.amountPaise })
      .eq("id", remember.presetId);
  }
  revalidatePath("/", "layout");
  // A replayed delete, Undo or edit may take awards back; a new entry never does.
  const revoke = ["delete", "undo_batch", "update"].includes(command.kind);
  after(() => syncRewards({ revoke }).catch(() => undefined));
  return json({
    ok: true,
    status: outcome.status,
    id: commandEntryId(command),
    undo: outcome.undo,
  });
}
