import "server-only";

import { periodBalanceInstants } from "@/domain";
import {
  getAccounts,
  getCategories,
  getLedgerSince,
  getProfile,
  getWalletBalances,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant, startForAnyZone } from "@/lib/data/slices";
import { parseInsightSelection } from "@/lib/insights-view";
import { reportFor, reportPeriods } from "@/lib/reports/params";

type Params = Record<string, string | string[] | undefined>;

/**
 * The report for these URL choices, for the preview and every export alike. It reads the rows
 * of the period and the one it's compared with, and the opening and closing balances from
 * `wallet_balances`. Those instants depend on the profile's time zone, so that one call waits
 * for the profile; the other reads start straight away.
 */
export async function loadReport(params: Params) {
  const now = requestNow();
  const since = startForAnyZone((settings) => reportPeriods(params, now, settings));
  const reads = Promise.all([
    getAccounts(),
    getLedgerSince(since === null ? null : isoInstant(since)),
    getCategories(),
  ]);
  // Awaited below; this only keeps a failure while the profile loads from going unreported.
  reads.catch(() => {});
  const profile = await getProfile();
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const { openingMs, closingMs } = periodBalanceInstants(
    parseInsightSelection(params, now, settings).period,
    now,
  );
  const [[accounts, ledger, categories], balances] = await Promise.all([
    reads,
    getWalletBalances(isoInstant(closingMs), openingMs === null ? null : isoInstant(openingMs)),
  ]);
  return {
    profile,
    categories,
    ...reportFor({ params, profile, accounts, ledger, balances, categories, now }),
  };
}
