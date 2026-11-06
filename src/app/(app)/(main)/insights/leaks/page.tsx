import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Droplets, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { NoteLine, PeriodPicker } from "@/components/insights/parts";
import { WhatIf } from "@/components/insights/what-if";
import { StatePanel } from "@/components/states/state-panel";
import { EntryCard } from "@/components/transactions/entry-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type PurchaseGrouping,
  comparisonWindows,
  formatBasisPoints,
  indexById,
  leakReport,
  MIN_REPEATS,
  moneyFormatter,
  occurredAtMs,
  periodScope,
  PURCHASE_GROUPINGS,
  toLocalDate,
} from "@/domain";
import {
  getAccounts,
  getCategories,
  getLedgerSince,
  getProfile,
  getQuickAddPresets,
  hasSpending,
} from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { isoInstant, startForAnyZone } from "@/lib/data/slices";
import { entryView } from "@/lib/entry-view";
import { formatDayLabel, formatTimeOf } from "@/lib/format";
import { newestFirst } from "@/lib/history";
import { historyHref, insightHref, insightWords, parseInsightSelection } from "@/lib/insights-view";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Money leaks" };

const GROUPING_LABELS: Record<PurchaseGrouping, string> = {
  description: "Similar description",
  merchant: "Merchant",
  tile: "Quick-add tile",
  category: "Category",
};

export default async function MoneyLeaksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = requestNow();
  // Leaks compare the chosen period with the one before it; nothing older is needed.
  const since = startForAnyZone((s) => {
    const { period } = parseInsightSelection(params, now, s);
    return [
      period,
      comparisonWindows(period, toLocalDate(now, s.timeZone), 1)?.previous[0] ?? null,
    ];
  });
  const [profile, categories, accounts, ledger, presets, anySpending] = await Promise.all([
    getProfile(),
    getCategories(),
    getAccounts(),
    getLedgerSince(since === null ? null : isoInstant(since)),
    getQuickAddPresets(),
    hasSpending(),
  ]);
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const tz = settings.timeZone;
  const today = toLocalDate(now, tz);
  const money = moneyFormatter(profile.currency);

  const selection = parseInsightSelection(params, now, settings);
  const { period } = selection;
  const words = insightWords(selection, today, categories, profile.currency);
  const by = (PURCHASE_GROUPINGS as readonly unknown[]).includes(params.by)
    ? (params.by as PurchaseGrouping)
    : "description";
  const previous = comparisonWindows(period, today, 1)?.previous[0] ?? null;
  const threshold = profile.smallPurchaseThresholdPaise;
  const report = leakReport({
    ledger,
    period,
    previous,
    by,
    thresholdPaise: threshold,
    labelOf: words.labelOf,
    tileLabels: new Map(presets.map((p) => [p.id, p.label])),
  });

  const ctx = {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById: new Map(accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    currency: profile.currency,
  };
  const entriesOf = (ids: readonly string[]) =>
    ids
      .map((id) => ctx.ledgerById.get(id)!)
      .sort(newestFirst)
      .map((tx) => ({
        ...entryView(tx, ctx),
        timeLabel: `${formatDayLabel(toLocalDate(occurredAtMs(tx), tz), today)}, ${formatTimeOf(tx.occurredAt, tz)}`,
      }));

  return (
    <>
      <PageHeader
        title="Money leaks"
        description="Repeated small purchases grouped together, so you can decide what’s worth it. No judgement: many of these may be exactly what you want."
      />
      <SectionTabs section="insights" />
      <PeriodPicker
        kind={selection.kind}
        customFrom={selection.customFrom}
        customTo={selection.customTo}
        error={selection.error}
        extra={`&by=${by}`}
      />
      <nav aria-label="Group by" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1">
          {PURCHASE_GROUPINGS.map((option) => (
            <li key={option}>
              <Link
                href={insightHref("/insights/leaks", selection, `&by=${option}`)}
                scroll={false}
                aria-current={option === by ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg px-3 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                  option === by && "bg-muted font-medium text-foreground",
                )}
              >
                {GROUPING_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {report.groups.length === 0 ? (
        <StatePanel
          icon={Droplets}
          title="Not enough repeated purchases yet"
          description={`A group appears when a purchase under ${money(threshold)} happens at least ${MIN_REPEATS} times ${words.period}.`}
          actions={
            anySpending ? (
              <Button variant="outline" asChild>
                <Link href="/settings">Change the small-purchase amount</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/add">
                  <Zap aria-hidden="true" />
                  Quick add
                </Link>
              </Button>
            )
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground" data-testid="leak-summary">
            {report.groups.length} repeated {report.groups.length === 1 ? "purchase" : "purchases"}{" "}
            under {money(threshold)} {words.period}: {money(report.netPaise)}
            {report.shareBp === null
              ? ""
              : `, ${formatBasisPoints(report.shareBp, 0)} of your spending`}
            .
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {report.groups.map((group) => {
              const href: Route = historyHref({
                type: "spending",
                ...periodScope(period),
                underPaise: threshold,
                by,
                key: group.key,
              });
              const c = group.comparison;
              const name = group.label.split(" › ").at(-1)!;
              return (
                <li key={group.key} className="min-w-0">
                  <Card
                    className="h-full gap-3"
                    data-testid="leak-group"
                    data-paise={group.netPaise}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="truncate font-semibold">{name}</h2>
                      <span className="tabular shrink-0 text-xl font-semibold">
                        {money(group.netPaise)}
                      </span>
                    </div>
                    <p className="tabular text-sm text-muted-foreground">
                      {[
                        `${group.count} times`,
                        `average ${money(group.averagePaise!)}`,
                        group.shareBp === null
                          ? null
                          : `${formatBasisPoints(group.shareBp, 0)} of spending`,
                        group.refundsPaise > 0 ? `${money(group.refundsPaise)} refunded` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c
                        ? `Compared with ${words.previous}: ${money(c.previousPaise)}, ${c.previousCount} ${c.previousCount === 1 ? "time" : "times"}. ${
                            c.deltaPaise === 0
                              ? "The same now."
                              : `${money(Math.abs(c.deltaPaise))} ${c.deltaPaise > 0 ? "more" : "less"} now.`
                          }`
                        : `Not enough data to compare yet. ${group.comparisonNote}`}
                    </p>
                    <WhatIf
                      group={group}
                      name={name}
                      span="a period like this one"
                      currency={profile.currency}
                    />
                    <details>
                      <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">
                        See the {group.transactionIds.length} entries
                      </summary>
                      <ul className="-mx-2 flex flex-col">
                        {entriesOf(group.transactionIds).map((entry) => (
                          <EntryCard key={entry.id} entry={entry} />
                        ))}
                      </ul>
                      <Link href={href} className="text-sm font-medium text-primary underline">
                        Open in Transactions
                      </Link>
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
          <NoteLine>
            What-ifs are simple estimates from the median price, not advice.
            {report.ungroupedCount > 0
              ? ` ${report.ungroupedCount} small ${report.ungroupedCount === 1 ? "purchase has" : "purchases have"} nothing to group by in this view.`
              : ""}
          </NoteLine>
        </>
      )}
    </>
  );
}
