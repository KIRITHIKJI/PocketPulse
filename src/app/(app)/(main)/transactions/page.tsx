import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Receipt, SearchX, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { type ListedDay, EntryList } from "@/components/transactions/entry-list";
import { HistoryFilterForm } from "@/components/transactions/history-filters";
import { Button } from "@/components/ui/button";
import {
  formatMoney,
  indexById,
  netSpending,
  resolvePeriod,
  sumPaise,
  toLocalDate,
} from "@/domain";
import { getAccounts, getCategories, getLedger, getProfile } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { entryView } from "@/lib/entry-view";
import { formatDayLabel, formatTimeOf } from "@/lib/format";
import { activeFilterCount, filterHistory, groupByDay, parseHistoryFilters } from "@/lib/history";
import { pickerTree } from "@/lib/picker-tree";

export const metadata: Metadata = { title: "Transactions" };

const PAGE_SIZE = 150;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [profile, accounts, categories, ledger] = await Promise.all([
    getProfile(),
    getAccounts(),
    getCategories(),
    getLedger(),
  ]);
  const tz = profile.timeZone;
  const now = requestNow();
  const today = toLocalDate(now, tz);
  const settings = { timeZone: tz, weekStartsOn: profile.weekStartsOn };
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });

  const { filters, errors } = parseHistoryFilters(params);
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
  const income = sumPaise(matches.filter((tx) => tx.type === "income").map((tx) => tx.amountPaise));

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
        description="Everything you’ve recorded, newest first. Tap an entry to see, edit or delete it."
        actions={
          <Button asChild>
            <Link href="/transactions/new">
              <Plus aria-hidden="true" />
              Add entry
            </Link>
          </Button>
        }
      />

      {ledger.length === 0 ? (
        <StatePanel
          icon={Receipt}
          title="No transactions yet"
          description="Your history appears here, grouped by day, as soon as you record something."
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
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
            data-testid="history-summary"
          >
            {matches.length} {matches.length === 1 ? "entry" : "entries"}
            {filtered ? " match" : ""} · net spending {money(spent)}
            {income > 0 ? ` · income ${money(income)}` : ""}
          </p>
          {matches.length === 0 ? (
            <StatePanel
              icon={SearchX}
              title="No entries match"
              description="Try fewer words or clear a filter."
              actions={
                <Button variant="outline" asChild>
                  <Link href="/transactions">Clear search and filters</Link>
                </Button>
              }
            />
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
