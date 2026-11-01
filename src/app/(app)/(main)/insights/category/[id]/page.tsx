import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarSearch } from "lucide-react";

import { FigureLink, NoteLine, PeriodPicker, RowLink } from "@/components/insights/parts";
import { ChangeArrow, PeriodTrend } from "@/components/insights/sections";
import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { type ListedDay, EntryList } from "@/components/transactions/entry-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  UNCATEGORIZED,
  buildInsights,
  formatBasisPoints,
  formatMoney,
  indexById,
  netSpending,
  periodScope,
  resolvePeriod,
  spendingDisplay,
  toLocalDate,
} from "@/domain";
import { getAccounts, getCategories, getLedger, getProfile } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { entryView } from "@/lib/entry-view";
import { formatDayLabel, formatTimeOf } from "@/lib/format";
import { filterHistory, groupByDay, parseHistoryFilters } from "@/lib/history";
import {
  UNASSIGNED_LABEL,
  UNCATEGORIZED_QUEUE,
  historyHref,
  insightHref,
  insightWords,
  parseGranularity,
  parseInsightSelection,
} from "@/lib/insights-view";

export const metadata: Metadata = { title: "Category insights" };

const LISTED_ENTRIES = 30;

/** Journey C: one category's total, count, average, trend, subcategories and exact entries. */
export default async function CategoryInsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const [profile, categories, accounts, ledger] = await Promise.all([
    getProfile(),
    getCategories(),
    getAccounts(),
    getLedger(),
  ]);
  const category = categories.find((c) => c.id === id);
  const unassigned = id === UNCATEGORIZED;
  if (!unassigned && (!category || category.parentId !== null || category.kind !== "expense")) {
    notFound();
  }

  const now = requestNow();
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });
  const selection = parseInsightSelection(query, now, settings);
  const { period } = selection;
  const words = insightWords(selection, today, categories, profile.currency);
  const model = buildInsights({
    ledger,
    period,
    today,
    settings,
    thresholdPaise: profile.smallPurchaseThresholdPaise,
    words,
  });

  const name = unassigned ? UNASSIGNED_LABEL : category!.name;
  const group = model.breakdown.categories.find((c) => c.key === id);
  const change = model.comparison?.categories.find((c) => c.key === id);
  const scope = { type: "spending", ...periodScope(period), category: id } as const;

  const ctx = {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    timeZone: tz,
    currency: profile.currency,
  };
  const href = historyHref(scope);
  const search = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
  const entries = filterHistory(ledger, parseHistoryFilters(search).filters, ctx);
  const days: ListedDay[] = groupByDay(entries.slice(0, LISTED_ENTRIES), tz).map((day) => {
    const net = netSpending(
      day.entries,
      resolvePeriod({ kind: "custom", from: day.date, to: day.date }, now, settings),
    );
    return {
      date: day.date,
      label: formatDayLabel(day.date, today),
      summary: net > 0 ? `Spent ${money(net)}` : net < 0 ? `Refunded ${money(-net)}` : null,
      entries: day.entries.map((tx) => ({
        ...entryView(tx, ctx),
        timeLabel: formatTimeOf(tx.occurredAt, tz),
      })),
    };
  });

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href={insightHref("/insights", selection)}>
          <ArrowLeft aria-hidden="true" />
          Insights
        </Link>
      </Button>
      <PageHeader
        title={name}
        description={`Everything in ${name} ${words.period}, and the entries behind it.`}
      />
      <PeriodPicker
        kind={selection.kind}
        customFrom={selection.customFrom}
        customTo={selection.customTo}
        error={selection.error}
      />

      {!group ? (
        <StatePanel
          icon={CalendarSearch}
          title={`Nothing in ${name} ${words.period}`}
          description="Pick another period to see this category."
        />
      ) : (
        <>
          {unassigned && (
            <NoteLine>
              These entries have no category yet.{" "}
              <Link href={UNCATEGORIZED_QUEUE} className="underline">
                Sort them in the Uncategorized queue
              </Link>
            </NoteLine>
          )}
          <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FigureLink
              href={href}
              label={`Net spending ${words.period}`}
              value={money(group.netPaise)}
              hint={
                group.shareBp === null
                  ? "Expenses minus refunds"
                  : `${formatBasisPoints(group.shareBp, 0)} of your spending`
              }
              testId="category-net"
            />
            <FigureLink href={href} label="Purchases" value={group.count} testId="category-count" />
            <FigureLink
              href={null}
              label="Average purchase"
              value={
                group.count >= 2 && group.averagePaise !== null ? money(group.averagePaise) : "—"
              }
              hint={group.count >= 2 ? undefined : "Needs at least 2 purchases"}
            />
            <FigureLink
              href={null}
              label="Median purchase"
              value={
                group.count >= 3 && group.medianPaise !== null ? money(group.medianPaise) : "—"
              }
              hint={group.count >= 3 ? undefined : "Needs at least 3 purchases"}
            />
          </section>
          {spendingDisplay(group, money).note && (
            <NoteLine>{spendingDisplay(group, money).note}</NoteLine>
          )}

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <PeriodTrend
              title={`${name} over time`}
              ledger={ledger}
              period={period}
              today={today}
              settings={settings}
              requested={parseGranularity(query.trend)}
              only={(entry) => (entry.categoryId ?? UNCATEGORIZED) === id}
              scope={{ type: "spending", category: id }}
              optionHref={(g) => insightHref(`/insights/category/${id}`, selection, `&trend=${g}`)}
              currency={profile.currency}
            />
            <Card className="min-w-0 gap-3" data-testid="category-compare">
              <h2 className="font-semibold">
                {words.previous ? `Compared with ${words.previous}` : "Compared with before"}
              </h2>
              {model.comparison?.comparable && change && model.previousWindow ? (
                <p className="flex items-center gap-2 text-sm">
                  <ChangeArrow up={change.deltaPaise > 0} />
                  <span className="tabular">
                    {money(change.previousPaise)} → {money(change.currentPaise)}
                  </span>
                  <Link
                    href={historyHref({
                      type: "spending",
                      ...periodScope(model.previousWindow),
                      category: id,
                    })}
                    className="underline"
                  >
                    See the earlier entries
                  </Link>
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not enough data to compare yet. {model.comparisonNote}
                </p>
              )}
              {group.subcategories.some((s) => s.key !== UNCATEGORIZED) && (
                <ul className="-mx-2 flex flex-col">
                  {group.subcategories.map((sub) => {
                    const none = sub.key === UNCATEGORIZED;
                    return (
                      <li key={sub.key}>
                        <RowLink
                          href={historyHref({
                            ...scope,
                            category: none ? id : sub.key,
                            noSubcategory: none,
                          })}
                        >
                          <span className="flex items-baseline justify-between gap-2 text-sm">
                            <span className="truncate">
                              {none ? "No subcategory" : words.labelOf(sub.key).split(" › ").at(-1)}
                            </span>
                            <span className="tabular shrink-0">
                              {money(sub.netPaise)} · {sub.count}×
                            </span>
                          </span>
                        </RowLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <section aria-label={`${name} entries`} className="flex flex-col gap-3">
            <h2 className="font-semibold">Entries</h2>
            <EntryList days={days} />
            {entries.length > LISTED_ENTRIES && (
              <Button variant="outline" asChild className="self-center">
                <Link href={href}>See all {entries.length} entries</Link>
              </Button>
            )}
          </section>
        </>
      )}
    </>
  );
}
