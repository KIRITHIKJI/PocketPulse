import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Droplets, Settings, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { NoteLine, PeriodPicker } from "@/components/insights/parts";
import { WhatIf } from "@/components/insights/what-if";
import { StatePanel } from "@/components/states/state-panel";
import { EntryCard } from "@/components/transactions/entry-list";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
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

/** Desktop columns: group · times · each · total · what-if. Phones stack the same cells. */
const COLUMNS =
  "lg:grid-cols-[minmax(0,1fr)_4.5rem_6.5rem_7rem_minmax(0,1.5fr)] lg:items-center lg:gap-4";

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

  const settingsLink = (
    <Button variant="outline" asChild>
      <Link href="/settings">
        <Settings aria-hidden="true" />
        Change the small-purchase amount
      </Link>
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          title="Money leaks"
          description="Repeated small purchases, grouped so you can decide what’s worth it. No judgement."
        />
        <div className="min-w-0 xl:shrink-0">
          <PeriodPicker
            kind={selection.kind}
            customFrom={selection.customFrom}
            customTo={selection.customTo}
            error={selection.error}
            extra={`&by=${by}`}
          />
        </div>
      </div>
      <SectionTabs section="insights" />
      <nav aria-label="Group by" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max items-center gap-1 rounded-xl border bg-muted/50 p-1">
          <li aria-hidden="true" className="px-2 type-caption text-muted-foreground">
            Group by
          </li>
          {PURCHASE_GROUPINGS.map((option) => (
            <li key={option}>
              <Link
                href={insightHref("/insights/leaks", selection, `&by=${option}`)}
                scroll={false}
                aria-current={option === by ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg px-3 type-body font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--duration-quick) outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11",
                  option === by && "bg-card text-foreground shadow-sm",
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
          description={
            <>
              No repeated small purchases {words.period}. A leak needs {MIN_REPEATS} similar
              purchases under <span className="money">{money(threshold)}</span>.
            </>
          }
          actions={
            anySpending ? (
              settingsLink
            ) : (
              <>
                <Button asChild>
                  <Link href="/add">
                    <Zap aria-hidden="true" />
                    Quick add
                  </Link>
                </Button>
                {settingsLink}
              </>
            )
          }
        />
      ) : (
        <Surface className="min-w-0">
          <SurfaceHeader title={`Repeated purchases ${words.period}`}>
            <p className="type-caption text-text-secondary money" data-testid="leak-summary">
              {report.groups.length} repeated{" "}
              {report.groups.length === 1 ? "purchase" : "purchases"} under {money(threshold)}{" "}
              {words.period}: {money(report.netPaise)}
              {report.shareBp === null
                ? ""
                : `, ${formatBasisPoints(report.shareBp, 0)} of your spending`}
              .
            </p>
          </SurfaceHeader>
          <div
            aria-hidden="true"
            className={cn(
              "hidden border-b pb-2 type-caption text-muted-foreground lg:grid",
              COLUMNS,
            )}
          >
            <span>Group</span>
            <span className="text-right">Times</span>
            <span className="text-right">Average</span>
            <span className="text-right">Total</span>
            <span>What if</span>
          </div>
          <ul className="flex flex-col divide-y">
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
              const extra = [
                group.shareBp === null
                  ? null
                  : `${formatBasisPoints(group.shareBp, 0)} of spending`,
                group.refundsPaise > 0 ? `${money(group.refundsPaise)} refunded` : null,
              ].filter(Boolean);
              return (
                <li
                  key={group.key}
                  className="flex min-w-0 flex-col gap-2 py-3 first:pt-0 last:pb-0 lg:first:pt-1"
                  data-testid="leak-group"
                  data-paise={group.netPaise}
                >
                  <div className={cn("grid gap-2", COLUMNS)}>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate type-body font-semibold">{name}</h3>
                        <span className="shrink-0 type-body font-semibold money lg:hidden">
                          {money(group.netPaise)}
                        </span>
                      </div>
                      <p className="type-caption text-muted-foreground money">
                        <span className="lg:hidden">
                          {group.count} times · average {money(group.averagePaise!)}
                          {extra.length > 0 && " · "}
                        </span>
                        {extra.join(" · ")}
                      </p>
                    </div>
                    <span className="hidden text-right type-body money lg:block">
                      {group.count}
                      <span aria-hidden="true">×</span>
                      <span className="sr-only"> times</span>
                    </span>
                    <span className="hidden text-right type-body money lg:block">
                      <span className="sr-only">average </span>
                      {money(group.averagePaise!)}
                    </span>
                    <span className="hidden text-right type-body font-semibold money lg:block">
                      <span className="sr-only">total </span>
                      {money(group.netPaise)}
                    </span>
                    <WhatIf
                      group={group}
                      name={name}
                      span="a period like this one"
                      currency={profile.currency}
                    />
                  </div>
                  <p className="type-caption text-muted-foreground money">
                    {c
                      ? `Compared with ${words.previous}: ${money(c.previousPaise)}, ${c.previousCount} ${c.previousCount === 1 ? "time" : "times"}. ${
                          c.deltaPaise === 0
                            ? "The same now."
                            : `${money(Math.abs(c.deltaPaise))} ${c.deltaPaise > 0 ? "more" : "less"} now.`
                        }`
                      : `Not enough data to compare yet. ${group.comparisonNote}`}
                  </p>
                  <details>
                    <summary className="inline-flex min-h-10 cursor-pointer items-center type-body font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11">
                      See the {group.transactionIds.length} entries
                    </summary>
                    <Surface variant="inset" className="mt-1 gap-1 p-1">
                      <ul className="flex flex-col">
                        {entriesOf(group.transactionIds).map((entry) => (
                          <EntryCard key={entry.id} entry={entry} />
                        ))}
                      </ul>
                      <Link
                        href={href}
                        className="inline-flex min-h-11 items-center self-start px-2 type-body font-medium text-primary underline underline-offset-2"
                      >
                        Open in Transactions
                      </Link>
                    </Surface>
                  </details>
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
        </Surface>
      )}
    </>
  );
}
