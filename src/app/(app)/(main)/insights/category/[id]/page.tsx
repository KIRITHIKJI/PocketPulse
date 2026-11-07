import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarSearch } from "lucide-react";

import { NoteLine, PeriodPicker, RowLink } from "@/components/insights/parts";
import { ChangeArrow, HeroStat, PeriodTrend } from "@/components/insights/sections";
import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { type ListedDay, EntryList } from "@/components/transactions/entry-list";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  buildInsights,
  formatBasisPoints,
  indexById,
  moneyFormatter,
  netSpending,
  periodScope,
  resolvePeriod,
  spendingDisplay,
  toLocalDate,
  UNCATEGORIZED,
} from "@/domain";
import { loadInsightsLedger } from "@/lib/data/insights";
import { getAccounts, getCategories, getProfile } from "@/lib/data/queries";
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
  const now = requestNow();
  const [profile, categories, accounts, ledger] = await Promise.all([
    getProfile(),
    getCategories(),
    getAccounts(),
    loadInsightsLedger(query, now),
  ]);
  const category = categories.find((c) => c.id === id);
  const unassigned = id === UNCATEGORIZED;
  if (!unassigned && (!category || category.parentId !== null || category.kind !== "expense")) {
    notFound();
  }

  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  const money = moneyFormatter(profile.currency);
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
  const note = group ? spendingDisplay(group, money).note : null;
  const hasSubs = group?.subcategories.some((s) => s.key !== UNCATEGORIZED) ?? false;

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="-mb-2 self-start">
        <Link href={insightHref("/insights", selection)}>
          <ArrowLeft aria-hidden="true" />
          Insights
        </Link>
      </Button>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          title={name}
          description={`Everything in ${name} ${words.period}, and the entries behind it.`}
        />
        <div className="min-w-0 xl:shrink-0">
          <PeriodPicker
            kind={selection.kind}
            customFrom={selection.customFrom}
            customTo={selection.customTo}
            error={selection.error}
          />
        </div>
      </div>

      {!group ? (
        <StatePanel
          icon={CalendarSearch}
          title={`Nothing in ${name} ${words.period}`}
          description="Pick another period to see this category."
          actions={
            <Button variant="outline" asChild>
              <Link href={insightHref("/insights", selection)}>Back to Insights</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            <Surface
              variant="hero"
              role="region"
              aria-label="Totals"
              className="min-w-0 lg:col-span-5"
            >
              <div className="flex flex-col gap-1">
                <h2 className="type-caption text-muted-foreground">Net spending {words.period}</h2>
                <Link
                  href={href}
                  className="self-start rounded-lg outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <span className="type-display money" data-testid="category-net">
                    {money(group.netPaise)}
                  </span>
                </Link>
                <p className="type-caption text-muted-foreground">
                  {group.shareBp === null
                    ? "Expenses minus refunds"
                    : `${formatBasisPoints(group.shareBp, 0)} of your spending`}
                </p>
              </div>
              <div data-testid="category-compare">
                {model.comparison?.comparable && change && model.previousWindow ? (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-body text-text-secondary">
                    <ChangeArrow up={change.deltaPaise > 0} />
                    <span>
                      {words.previous
                        ? `Compared with ${words.previous}:`
                        : "Compared with before:"}{" "}
                      <span className="money">
                        {money(change.previousPaise)} → {money(change.currentPaise)}
                      </span>
                    </span>
                    <Link
                      href={historyHref({
                        type: "spending",
                        ...periodScope(model.previousWindow),
                        category: id,
                      })}
                      className="underline underline-offset-2"
                    >
                      See the earlier entries
                    </Link>
                  </p>
                ) : (
                  <p className="type-body text-muted-foreground">
                    Not enough data to compare yet. {model.comparisonNote}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 border-t pt-3">
                <HeroStat
                  href={href}
                  label="Purchases"
                  value={group.count}
                  testId="category-count"
                />
                <HeroStat
                  href={null}
                  label="Average"
                  value={
                    group.count >= 2 && group.averagePaise !== null
                      ? money(group.averagePaise)
                      : "—"
                  }
                  hint={group.count >= 2 ? undefined : "Needs at least 2 purchases"}
                />
                <HeroStat
                  href={null}
                  label="Median"
                  value={
                    group.count >= 3 && group.medianPaise !== null ? money(group.medianPaise) : "—"
                  }
                  hint={group.count >= 3 ? undefined : "Needs at least 3 purchases"}
                />
              </div>
              {note && <NoteLine>{note}</NoteLine>}
              {unassigned && (
                <NoteLine>
                  These entries have no category yet.{" "}
                  <Link href={UNCATEGORIZED_QUEUE} className="underline underline-offset-2">
                    Sort them in the Uncategorized queue
                  </Link>
                </NoteLine>
              )}
            </Surface>

            <div className="flex min-w-0 flex-col gap-4 lg:col-span-7 lg:gap-6">
              <PeriodTrend
                subject={`${name} spending`}
                ledger={ledger}
                period={period}
                today={today}
                settings={settings}
                requested={parseGranularity(query.trend)}
                only={(entry) => (entry.categoryId ?? UNCATEGORIZED) === id}
                scope={{ type: "spending", category: id }}
                optionHref={(g) =>
                  insightHref(`/insights/category/${id}`, selection, `&trend=${g}`)
                }
                currency={profile.currency}
              />
              {hasSubs && (
                <Surface className="min-w-0" data-testid="category-subcategories">
                  <SurfaceHeader title="Subcategories" meta="Open one for its entries" />
                  <ul className="-mx-2 flex flex-col divide-y">
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
                            <span className="flex items-baseline justify-between gap-2 type-body">
                              <span className="truncate">
                                {none
                                  ? "No subcategory"
                                  : words.labelOf(sub.key).split(" › ").at(-1)}
                              </span>
                              <span className="shrink-0 money">
                                {money(sub.netPaise)}
                                <span className="text-muted-foreground"> · {sub.count}×</span>
                              </span>
                            </span>
                          </RowLink>
                        </li>
                      );
                    })}
                  </ul>
                </Surface>
              )}
            </div>
          </div>

          <section aria-label={`${name} entries`} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="type-heading">Entries</h2>
              <p className="type-caption text-muted-foreground">
                {entries.length > LISTED_ENTRIES
                  ? `Newest ${LISTED_ENTRIES} of ${entries.length}`
                  : `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
              </p>
            </div>
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
