import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Receipt, SearchX, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { WaitingEntries } from "@/components/offline/waiting-entries";
import { GoalReleaseNotes } from "@/components/plan/goal-release-notes";
import { InsightExplored } from "@/components/rewards/insight-explored";
import { StatePanel } from "@/components/states/state-panel";
import { type ListedDay, EntryList } from "@/components/transactions/entry-list";
import { HistoryFilterForm } from "@/components/transactions/history-filters";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import {
  indexById,
  isActive,
  moneyFormatter,
  netSpending,
  resolvePeriod,
  sumPaise,
  toLocalDate,
} from "@/domain";
import {
  getAccounts,
  getCategories,
  getGoalLedger,
  getGoalLedgerVersions,
  getGoals,
  getLedger,
  getLedgerSince,
  getLedgerVersions,
  getProfile,
  getQuickAddPresets,
  getSpendingLedger,
  hasLedgerEntries,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant, mergeLedger, startForAnyZone } from "@/lib/data/slices";
import { entryView } from "@/lib/entry-view";
import { formatDayLabel, formatTimeOf } from "@/lib/format";
import { activeFilterCount, filterHistory, groupByDay, parseHistoryFilters } from "@/lib/history";
import { pickerTree } from "@/lib/picker-tree";
import { goalReleaseNotes } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = requestNow();
  const { filters, errors } = parseHistoryFilters(params);
  // With a start date, only rows from then on can match; without one, the list (and its count
  // and totals) is all of history.
  const since = filters.from
    ? startForAnyZone((s) => [
        resolvePeriod({ kind: "custom", from: filters.from!, to: filters.from! }, now, s),
      ])
    : null;
  const [
    profile,
    accounts,
    categories,
    ledger,
    presets,
    goals,
    anyEntries,
    [noteLedger, versions],
  ] = await Promise.all([
    getProfile(),
    getAccounts(),
    getCategories(),
    getLedgerSince(since === null ? null : isoInstant(since)),
    getQuickAddPresets(),
    getGoals(),
    since === null ? true : hasLedgerEntries(),
    // A release left behind when its purchase was deleted: read from goal money and purchases.
    since === null
      ? Promise.all([getLedger(), getLedgerVersions()])
      : Promise.all([
          Promise.all([getSpendingLedger(), getGoalLedger()]).then((parts) =>
            mergeLedger(...parts),
          ),
          getGoalLedgerVersions(),
        ]),
  ]);
  const tz = profile.timeZone;
  const today = toLocalDate(now, tz);
  const settings = { timeZone: tz, weekStartsOn: profile.weekStartsOn };
  const money = moneyFormatter(profile.currency);

  const tileNames = new Map(presets.map((p) => [p.id, p.label]));
  const ctx = {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    timeZone: tz,
    currency: profile.currency,
  };
  const matches = filterHistory(ledger, filters, ctx);
  const limit = Math.max(PAGE_SIZE, Number(params.show) || PAGE_SIZE);
  const shown = matches.slice(0, limit);
  const filtered = activeFilterCount(filters) > 0 || filters.q !== "";

  // Totals of what's listed, from the same domain functions every other screen uses.
  const allTime = resolvePeriod({ kind: "all_time" }, now, settings);
  const spent = netSpending(matches, allTime);
  const income = sumPaise(
    matches.filter((tx) => tx.type === "income" && isActive(tx)).map((tx) => tx.amountPaise),
  );
  const narrowing = [
    filters.noSubcategory ? "entries with no subcategory" : null,
    filters.underPaise !== null ? `small purchases under ${money(filters.underPaise)}` : null,
    filters.group
      ? `one repeated purchase (“${tileNames.get(filters.group.key) ?? filters.group.key}”)`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  const days: ListedDay[] = groupByDay(shown, tz).map((day) => {
    const daySpent = netSpending(
      day.entries,
      resolvePeriod({ kind: "custom", from: day.date, to: day.date }, now, settings),
    );
    return {
      date: day.date,
      label: formatDayLabel(day.date, today),
      summary:
        daySpent > 0
          ? `Spent ${money(daySpent)}`
          : daySpent < 0
            ? `Refunded ${money(-daySpent)}`
            : null,
      entries: day.entries.map((tx) => ({
        ...entryView(tx, ctx),
        timeLabel: formatTimeOf(tx.occurredAt, tz),
      })),
    };
  });

  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && key !== "show") nextParams.set(key, value);
  }
  nextParams.set("show", String(limit + PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Everything you’ve recorded, newest first."
        actions={
          <Button asChild>
            <Link href="/transactions/new">
              <Plus aria-hidden="true" />
              Add entry
            </Link>
          </Button>
        }
      />

      <WaitingEntries currency={profile.currency} />

      {params.from_insight === "1" && (
        <InsightExplored
          scope={Object.entries(params)
            .filter(([key]) => key !== "from_insight" && key !== "show")
            .map(([key, value]) => `${key}=${String(value)}`)
            .sort()
            .join("&")}
        />
      )}

      <GoalReleaseNotes
        notes={goalReleaseNotes(noteLedger, goals, versions)}
        currency={profile.currency}
      />

      {(since === null ? ledger.length === 0 : !anyEntries) ? (
        <StatePanel
          icon={Receipt}
          title="No transactions yet"
          description="No entries yet. Your first tea or bus ride starts the list."
          actions={
            <>
              <Button asChild>
                <Link href="/add">
                  <Zap aria-hidden="true" />
                  Quick add
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/transactions/new">Full form</Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <HistoryFilterForm
            filters={filters}
            errors={errors}
            activeCount={activeFilterCount(filters)}
            accounts={accounts}
            expenseTree={pickerTree(categories, "expense")}
            incomeTree={pickerTree(categories, "income")}
          />
          <div className="flex flex-col gap-1">
            <p
              className="type-body text-text-secondary"
              aria-live="polite"
              data-testid="history-summary"
            >
              {matches.length} {matches.length === 1 ? "entry" : "entries"}
              {filtered ? " match" : ""} · net spending{" "}
              <span className="text-foreground money">{money(spent)}</span>
              {income > 0 ? (
                <>
                  {" "}
                  · income <span className="text-money-positive money">{money(income)}</span>
                </>
              ) : null}
            </p>
            {narrowing && (
              <p className="type-body text-text-secondary" data-testid="history-narrowing">
                Showing {narrowing}.{" "}
                <Link
                  href="/transactions"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  See everything
                </Link>
              </p>
            )}
          </div>
          {matches.length === 0 ? (
            <Surface>
              <StatePanel
                icon={SearchX}
                size="section"
                title="No entries match"
                description="Try fewer words or clear a filter."
                actions={
                  <Button variant="outline" asChild>
                    <Link href="/transactions">Clear search and filters</Link>
                  </Button>
                }
              />
            </Surface>
          ) : (
            <>
              <EntryList days={days} />
              {matches.length > shown.length && (
                <Button variant="outline" asChild className="self-center">
                  <Link href={`/transactions?${nextParams.toString()}`} scroll={false}>
                    Show more ({matches.length - shown.length} older)
                  </Link>
                </Button>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
