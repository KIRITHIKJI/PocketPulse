import "server-only";

import type { ServerClient } from "@/lib/data/session";
import type { LedgerCommand } from "@/lib/ledger/commands";
import { type LedgerOutcome, runLedgerCommandWith } from "@/lib/ledger/executor";

export type { LedgerOutcome };

/**
 * Runs one ledger command as the signed-in user (RLS and the integrity triggers apply; the owner
 * is always the session user). Every financial write in the app goes through here.
 */
export function executeLedgerCommand(
  supabase: ServerClient,
  command: LedgerCommand,
): Promise<LedgerOutcome> {
  return runLedgerCommandWith(
    {
      async readRow(id) {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        return { row: data, error };
      },
      async call({ fn, args }) {
        const { data, error } = await supabase.rpc(fn, args);
        return { data, error };
      },
    },
    command,
  );
}
