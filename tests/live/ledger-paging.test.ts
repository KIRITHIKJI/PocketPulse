/**
 * Read-only live check of keyset paging: the first account's ledger read in small pages must be
 * the same rows, in the same order, as one read of the whole thing. Uses the publishable key and
 * E2E_EMAIL / E2E_PASSWORD from .env.e2e.local. Writes nothing.
 */
import { createClient } from "@supabase/supabase-js";

import { afterLedgerRow, fetchAll, fetchLedgerPages } from "@/lib/data/paging";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

describe.skipIf(!(url && key && email && password))("live ledger paging", () => {
  it("keyset pages match a single ordered read", async () => {
    const sb = createClient(url!, key!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await sb.auth.signInWithPassword({ email: email!, password: password! });
    expect(error).toBeNull();
    try {
      const active = () => sb.from("transactions").select("*").is("deleted_at", null);
      const whole = await fetchAll(
        (from, to) =>
          active().order("occurred_at", { ascending: false }).order("id").range(from, to),
        "entries",
      );
      const paged = await fetchLedgerPages(
        (after, limit) =>
          (after ? active().or(afterLedgerRow(after)) : active())
            .order("occurred_at", { ascending: false })
            .order("id")
            .limit(limit),
        "entries",
        37,
      );
      // Small pages, so the continuation filter runs many times against real timestamps.
      expect(whole.length).toBeGreaterThan(37);
      expect(paged.map((row) => row.id)).toEqual(whole.map((row) => row.id));
      expect(paged).toEqual(whole);
    } finally {
      await sb.auth.signOut({ scope: "local" });
    }
  });
});
