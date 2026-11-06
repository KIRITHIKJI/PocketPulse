import "server-only";

import { cache } from "react";

import {
  type SafeToSpendResult,
  type TimeSettings,
  type Transaction,
  addMonths,
  calculatePlan,
  moneyFormatter,
  resolvePeriod,
  toLocalDate,
} from "@/domain";
import {
  type Profile,
  getAccounts,
  getCommitmentPayments,
  getCommitments,
  getGoalLedger,
  getLedgerSince,
  getProfile,
  getRecurringEntries,
  getRecurringTemplates,
  getWalletBalances,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant, mergeLedger, startForAnyZone } from "@/lib/data/slices";
import { formatLocalDate } from "@/lib/format";

interface PlanData {
  profile: Profile;
  settings: TimeSettings;
  now: number;
  today: string;
  money: (paise: number) => string;
  /**
   * The rows the plan screens use, not all of them: the last month (recent pace, today, the
   * current income cycle), all goal money, and the entries that paid bills or recurring items.
   */
  ledger: Transaction[];
  commitments: Awaited<ReturnType<typeof getCommitments>>;
  templates: Awaited<ReturnType<typeof getRecurringTemplates>>;
  result: SafeToSpendResult;
}

/** One calculation per request, from the income date and reserve saved on the profile. */
export const loadPlan = cache(async (): Promise<PlanData> => {
  const now = requestNow();
  // An income cycle is at most a month long, and the pace looks back 14 days.
  const since = startForAnyZone((s) => {
    const today = toLocalDate(now, s.timeZone);
    return [resolvePeriod({ kind: "custom", from: addMonths(today, -1), to: today }, now, s)];
  })!;
  const [
    profile,
    accounts,
    recent,
    goalMoney,
    recurring,
    payments,
    balances,
    commitments,
    templates,
  ] = await Promise.all([
    getProfile(),
    getAccounts(),
    getLedgerSince(isoInstant(since)),
    getGoalLedger(),
    getRecurringEntries(),
    getCommitmentPayments(),
    getWalletBalances(isoInstant(now)),
    getCommitments(),
    getRecurringTemplates(),
  ]);
  const ledger = mergeLedger(recent, goalMoney, recurring, payments);
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const money = moneyFormatter(profile.currency);
  const result = calculatePlan({
    accounts,
    ledger,
    balance: balances.closing,
    commitments,
    templates,
    now,
    settings,
    nextIncomeDate: profile.nextIncomeDate,
    reservePaise: profile.safeToSpendReservePaise,
    money,
    dateText: formatLocalDate,
  });
  return {
    profile,
    settings,
    now,
    today: toLocalDate(now, profile.timeZone),
    money,
    ledger,
    commitments,
    templates,
    result,
  };
});
