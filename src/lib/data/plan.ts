import "server-only";

import { cache } from "react";

import {
  type SafeToSpendResult,
  type TimeSettings,
  calculatePlan,
  formatMoney,
  toLocalDate,
} from "@/domain";
import {
  type Profile,
  getAccounts,
  getCommitments,
  getLedger,
  getProfile,
  getRecurringTemplates,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { formatLocalDate } from "@/lib/format";

export interface PlanData {
  profile: Profile;
  settings: TimeSettings;
  now: number;
  today: string;
  money: (paise: number) => string;
  ledger: Awaited<ReturnType<typeof getLedger>>;
  commitments: Awaited<ReturnType<typeof getCommitments>>;
  templates: Awaited<ReturnType<typeof getRecurringTemplates>>;
  result: SafeToSpendResult;
}

/** One calculation per request, from the income date and reserve saved on the profile. */
export const loadPlan = cache(async (): Promise<PlanData> => {
  const [profile, accounts, ledger, commitments, templates] = await Promise.all([
    getProfile(),
    getAccounts(),
    getLedger(),
    getCommitments(),
    getRecurringTemplates(),
  ]);
  const now = requestNow();
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });
  const result = calculatePlan({
    accounts,
    ledger,
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
