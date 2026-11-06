import "server-only";

import type { Instant, Transaction } from "@/domain";
import { getIncomeSince, getSpendingLedger } from "@/lib/data/queries";
import { isoInstant, mergeLedger, startForAnyZone } from "@/lib/data/slices";
import { parseInsightSelection } from "@/lib/insights-view";

type Params = Record<string, string | string[] | undefined>;

/**
 * The rows Insights needs: all purchases and refunds (what "looks recurring" and the history
 * baseline span), and income for the chosen period only, the one place it appears.
 */
export async function loadInsightsLedger(params: Params, now: Instant): Promise<Transaction[]> {
  const since = startForAnyZone((settings) => [
    parseInsightSelection(params, now, settings).period,
  ]);
  const [spending, income] = await Promise.all([
    getSpendingLedger(),
    getIncomeSince(since === null ? null : isoInstant(since)),
  ]);
  return mergeLedger(spending, income);
}
