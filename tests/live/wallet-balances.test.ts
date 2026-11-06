/**
 * Read-only live check of `wallet_balances` on the hosted project: for each test account, the
 * function's balances equal the domain's, worked out from every row the account can read, at
 * several instants including IST midnights. Each account sees only its own wallets. Writes nothing.
 */
import { createClient } from "@supabase/supabase-js";

import { ledgerBalances } from "@/domain";
import { rowToAccount, rowToLedgerBalances, rowToTransaction } from "@/lib/data/mappers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const users = [
  { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
  { email: process.env.E2E_USER_B_EMAIL, password: process.env.E2E_USER_B_PASSWORD },
];
const ready = Boolean(url && key && users.every((u) => u.email && u.password));

const INSTANTS = [
  "2026-10-01T00:00:00+05:30",
  "2026-11-01T00:00:00+05:30",
  "2026-10-31T23:59:59.999+05:30",
  new Date().toISOString(),
];

describe.skipIf(!ready)("live wallet_balances", () => {
  it("matches the domain for each account, and shows only its own wallets", async () => {
    const seen: string[][] = [];
    for (const user of users) {
      const sb = createClient(url!, key!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: auth, error } = await sb.auth.signInWithPassword({
        email: user.email!,
        password: user.password!,
      });
      expect(error).toBeNull();
      try {
        const [{ data: profile }, { data: accountRows }, { data: rows }] = await Promise.all([
          sb.from("profiles").select("time_zone").single(),
          sb.from("accounts").select("*"),
          sb.from("transactions").select("*").limit(5000),
        ]);
        const accounts = (accountRows ?? []).map(rowToAccount);
        expect(accounts.every((a) => a.ownerId === auth.user!.id)).toBe(true);
        const ledger = (rows ?? []).map(rowToTransaction);
        for (const closing of INSTANTS) {
          for (const opening of [null, INSTANTS[0]!]) {
            const { data, error: rpcError } = await sb.rpc(
              "wallet_balances",
              opening === null
                ? { p_closing: closing }
                : { p_closing: closing, p_opening: opening },
              { get: true },
            );
            expect(rpcError).toBeNull();
            const fromDb = rowToLedgerBalances(
              data,
              Date.parse(closing),
              opening === null ? null : Date.parse(opening),
            );
            const fromDomain = ledgerBalances(
              accounts,
              ledger,
              Date.parse(closing),
              opening === null ? null : Date.parse(opening),
              profile!.time_zone as string,
            );
            const sorted = <T extends { accountId: string }>(list: readonly T[]) =>
              [...list].sort((x, y) => (x.accountId < y.accountId ? -1 : 1));
            expect(fromDb.closing.balancePaise).toBe(fromDomain.closing.balancePaise);
            expect(sorted(fromDb.closing.accounts)).toEqual(sorted(fromDomain.closing.accounts));
            expect(fromDb.opening?.balancePaise).toBe(fromDomain.opening?.balancePaise);
            expect(Object.fromEntries(fromDb.entriesBeforeOpening)).toEqual(
              Object.fromEntries(fromDomain.entriesBeforeOpening),
            );
          }
        }
        seen.push(accounts.map((a) => a.id));
      } finally {
        await sb.auth.signOut({ scope: "local" });
      }
    }
    // The two accounts share no wallet.
    expect(seen[0]!.filter((id) => seen[1]!.includes(id))).toEqual([]);
  });
});
