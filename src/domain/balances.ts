/**
 * Balances reconstructed from the ledger. Nothing here reads a stored "current balance": every
 * figure — today's or a historical month-end — is opening balance + dated ledger activity up to
 * an explicit instant, and every result says which instant (`asOfMs`) and scope it describes.
 *
 * Per account:   opening + income + refunds + transfers in − expenses − transfers out
 * Consolidated:  Σ account balances = opening total + income + refunds − expenses
 *                (transfers cancel out; allocations never move money).
 */
import { addPaise, sumPaise, type Paise } from "./money";
import { isActive, occurredAtMs } from "./ledger";
import type { Account, Transaction } from "./schemas";
import { DEFAULT_TIMEZONE, type Instant, type Period, startOfLocalDate } from "./time";

/** Signed effect of one transaction on one account's balance (0 if unrelated). */
export function accountDelta(tx: Transaction, accountId: string): Paise {
  switch (tx.type) {
    case "income":
    case "refund":
      return tx.accountId === accountId ? tx.amountPaise : 0;
    case "expense":
      return tx.accountId === accountId ? -tx.amountPaise : 0;
    case "transfer":
      if (tx.fromAccountId === accountId) return -tx.amountPaise;
      if (tx.toAccountId === accountId) return tx.amountPaise;
      return 0;
    case "allocation":
    case "allocation_release":
      return 0; // earmarks only — see savings.ts
  }
}

export function trackingStartMs(account: Account, timeZone = DEFAULT_TIMEZONE): Instant {
  return startOfLocalDate(account.openingBalanceDate, timeZone);
}

/**
 * Whether a transaction affects balances for this account: active and dated on/after the
 * account's opening balance date (earlier activity is already inside the opening balance).
 */
function countsFor(tx: Transaction, account: Account, timeZone: string): boolean {
  return isActive(tx) && occurredAtMs(tx) >= trackingStartMs(account, timeZone);
}

export interface AccountBalance {
  scope: "account";
  accountId: string;
  /** Balance immediately before `asOfMs`; null when tracking had not started yet. */
  balancePaise: Paise | null;
  asOfMs: Instant;
  tracked: boolean;
}

export function accountBalanceAt(
  account: Account,
  ledger: readonly Transaction[],
  asOfMs: Instant,
  timeZone = DEFAULT_TIMEZONE,
): AccountBalance {
  const start = trackingStartMs(account, timeZone);
  if (asOfMs < start) {
    return { scope: "account", accountId: account.id, balancePaise: null, asOfMs, tracked: false };
  }
  let balance = account.openingBalancePaise;
  for (const tx of ledger) {
    if (!countsFor(tx, account, timeZone) || occurredAtMs(tx) >= asOfMs) continue;
    balance = addPaise(balance, accountDelta(tx, account.id));
  }
  return { scope: "account", accountId: account.id, balancePaise: balance, asOfMs, tracked: true };
}

export interface ConsolidatedBalance {
  scope: "consolidated";
  balancePaise: Paise;
  asOfMs: Instant;
  accounts: AccountBalance[];
  /** Accounts whose tracking starts after `asOfMs`; they contribute nothing to the total. */
  untrackedAccountIds: string[];
}

/** Total tracked money across all the user's accounts just before `asOfMs`. */
export function consolidatedBalanceAt(
  accounts: readonly Account[],
  ledger: readonly Transaction[],
  asOfMs: Instant,
  timeZone = DEFAULT_TIMEZONE,
): ConsolidatedBalance {
  const perAccount = accounts.map((a) => accountBalanceAt(a, ledger, asOfMs, timeZone));
  return {
    scope: "consolidated",
    balancePaise: sumPaise(perAccount.map((b) => b.balancePaise ?? 0)),
    asOfMs,
    accounts: perAccount,
    untrackedAccountIds: perAccount.filter((b) => !b.tracked).map((b) => b.accountId),
  };
}

export interface PeriodSummary {
  period: Period;
  opening: { balancePaise: Paise; asOfMs: Instant | null };
  closing: { balancePaise: Paise; asOfMs: Instant; provisional: boolean };
  incomePaise: Paise;
  /** Gross expenses (before refunds). */
  expensesPaise: Paise;
  refundsPaise: Paise;
  /** expenses − refunds. */
  netSpendingPaise: Paise;
  /** income + refunds − expenses. Equals closing − opening − newlyTrackedOpeningPaise. */
  netMovementPaise: Paise;
  /** Opening balances of accounts whose tracking started inside the period. */
  newlyTrackedOpeningPaise: Paise;
  /** Money moved between own accounts (informational; nets to zero). */
  transferredPaise: Paise;
  allocatedPaise: Paise;
  releasedPaise: Paise;
  counts: { income: number; expense: number; refund: number; transfer: number; allocation: number };
}

/**
 * Opening/closing balance and money flows for a period, reconstructed from the ledger.
 * `closing` is as of the period end, or `now` when the period hasn't ended (then provisional).
 * For all-time the opening balance is the sum of every account's opening balance.
 */
export function summarizePeriod(
  accounts: readonly Account[],
  ledger: readonly Transaction[],
  period: Period,
  now: Instant,
  timeZone = period.timeZone,
): PeriodSummary {
  const openingMs = period.startMs;
  // A period that hasn't started yet has no activity: closing collapses onto its start.
  const closingMs = Math.max(
    openingMs ?? Number.NEGATIVE_INFINITY,
    period.endMs === null ? now : Math.min(period.endMs, now),
  );
  const provisional = period.endMs === null || period.endMs > now;

  let openingBalance = 0;
  let newlyTracked = 0;
  for (const account of accounts) {
    const trackStart = trackingStartMs(account, timeZone);
    if (trackStart > closingMs) continue; // not tracked within this period at all
    if (openingMs === null) {
      openingBalance = addPaise(openingBalance, account.openingBalancePaise);
    } else if (trackStart <= openingMs) {
      openingBalance = addPaise(
        openingBalance,
        accountBalanceAt(account, ledger, openingMs, timeZone).balancePaise ?? 0,
      );
    } else {
      newlyTracked = addPaise(newlyTracked, account.openingBalancePaise);
    }
  }

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const inWindow = (tx: Transaction) => {
    const t = occurredAtMs(tx);
    return isActive(tx) && (openingMs === null || t >= openingMs) && t < closingMs;
  };
  const tracked = (tx: Transaction, accountId: string) => {
    const account = accountById.get(accountId);
    return account !== undefined && countsFor(tx, account, timeZone);
  };

  let income = 0;
  let expenses = 0;
  let refunds = 0;
  let transferred = 0;
  let allocated = 0;
  let released = 0;
  const counts = { income: 0, expense: 0, refund: 0, transfer: 0, allocation: 0 };
  for (const tx of ledger) {
    if (!inWindow(tx)) continue;
    switch (tx.type) {
      case "income":
        if (!tracked(tx, tx.accountId)) break;
        income = addPaise(income, tx.amountPaise);
        counts.income++;
        break;
      case "expense":
        if (!tracked(tx, tx.accountId)) break;
        expenses = addPaise(expenses, tx.amountPaise);
        counts.expense++;
        break;
      case "refund":
        if (!tracked(tx, tx.accountId)) break;
        refunds = addPaise(refunds, tx.amountPaise);
        counts.refund++;
        break;
      case "transfer":
        transferred = addPaise(transferred, tx.amountPaise);
        counts.transfer++;
        break;
      case "allocation":
        allocated = addPaise(allocated, tx.amountPaise);
        counts.allocation++;
        break;
      case "allocation_release":
        released = addPaise(released, tx.amountPaise);
        counts.allocation++;
        break;
    }
  }

  const closing = consolidatedBalanceAt(accounts, ledger, closingMs, timeZone).balancePaise;
  return {
    period,
    opening: { balancePaise: openingBalance, asOfMs: openingMs },
    closing: { balancePaise: closing, asOfMs: closingMs, provisional },
    incomePaise: income,
    expensesPaise: expenses,
    refundsPaise: refunds,
    netSpendingPaise: expenses - refunds,
    netMovementPaise: income + refunds - expenses,
    newlyTrackedOpeningPaise: newlyTracked,
    transferredPaise: transferred,
    allocatedPaise: allocated,
    releasedPaise: released,
    counts,
  };
}
