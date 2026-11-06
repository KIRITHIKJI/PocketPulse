import "server-only";

import { cache } from "react";

import { type Account } from "@/domain";
import { DataLoadError } from "@/lib/data/errors";
import { fetchAll } from "@/lib/data/paging";
import { rowToAccount } from "@/lib/data/mappers";
import { type Session, requireSession } from "@/lib/data/session";
import { type Row } from "./shared";

export interface AccountRecord extends Account {
  sortOrder: number;
}

/** All wallets, archived ones included (history and balances still use them). */
export const getAccounts = cache(async (): Promise<AccountRecord[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("accounts")
        .select("*")
        .order("is_default", { ascending: false })
        .order("sort_order")
        .order("created_at")
        .range(from, to),
    "your wallets",
  );
  return rows.map((row) => ({ ...rowToAccount(row), sortOrder: Number(row.sort_order ?? 0) }));
});

/** Returns the default wallet, creating "Cash" (₹0 from today) if the user has none yet. */
export async function ensureDefaultAccount(session?: Session): Promise<Account> {
  const { supabase } = session ?? (await requireSession());
  const { data, error } = await supabase.rpc("ensure_default_account");
  if (error || !data) throw new DataLoadError("your default wallet", error?.code);
  return rowToAccount(data as Row);
}

/**
 * All wallets and the default one. The default is found in the wallets already read, so only a
 * user who has none yet pays for the call that creates it; that wallet then joins the list.
 */
export const getAccountsWithDefault = cache(
  async (): Promise<{ accounts: AccountRecord[]; defaultAccount: Account }> => {
    const accounts = await getAccounts();
    const existing = accounts.find((account) => account.isDefault);
    if (existing) return { accounts, defaultAccount: existing };
    const created = await ensureDefaultAccount();
    const promoted = accounts.find((account) => account.id === created.id);
    return {
      // Listed first, as the database orders the default wallet.
      accounts: [
        { ...created, sortOrder: promoted?.sortOrder ?? 0 },
        ...accounts.filter((account) => account.id !== created.id),
      ],
      defaultAccount: created,
    };
  },
);
