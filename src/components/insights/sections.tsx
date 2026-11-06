import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Inbox, Sparkles } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { type TrendRow, NoteLine, RowLink, ShareBar, TrendCard } from "@/components/insights/parts";
import { Card } from "@/components/ui/card";
import {
  type Category,
  type CategoryBreakdown,
  type CategoryGroup,
  type CurrencyCode,
  type InsightWords,
  type Paise,
  type Period,
  type SpendingEntry,
  type SpendingScope,
  type TimeSettings,
  type Transaction,
  type TrendGranularity,
  chartShares,
  formatBasisPoints,
  moneyFormatter,
  periodScope,
  spendingDisplay,
  trendView,
  UNCATEGORIZED,
} from "@/domain";
import {
  type InsightSelection,
  UNASSIGNED_LABEL,
  UNCATEGORIZED_QUEUE,
  TREND_LABELS,
  bucketLabel,
  historyHref,
  insightHref,
} from "@/lib/insights-view";

const countText = (n: number, word = "purchase") => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The trend for a period, as the chart card, already linked to its entries. */
export function PeriodTrend({
  ledger,
  period,
  today,
  settings,
  requested,
  only,
  scope,
  optionHref,
  currency,
  title,
}: {
  ledger: readonly Transaction[];
  period: Period;
  today: string;
  settings: TimeSettings;
  requested: TrendGranularity | null;
  only?: (entry: SpendingEntry) => boolean;
  scope: Omit<SpendingScope, "from" | "to">;
  optionHref: (g: TrendGranularity) => Route;
  currency: CurrencyCode;
  title: string;
}) {
  const view = trendView(ledger, period, today, settings, requested, only);
  const money = moneyFormatter(currency);
  const granularity = view.granularity;
  const rows: TrendRow[] = view.points.map((p) => ({
    key: p.startDate,
    label: granularity ? bucketLabel(p.from, granularity) : p.from,
    chartPaise: p.chartPaise,
    amountLabel: money(p.netPaise),
    detail: p.count === 0 && p.netPaise === 0 ? "Nothing recorded" : countText(p.count),
    href: p.transactionIds.length > 0 ? historyHref({ ...scope, from: p.from, to: p.to }) : null,
  }));
  const peak = view.points.reduce((a, b) => (b.chartPaise > a.chartPaise ? b : a), view.points[0]!);
  return (
    <TrendCard
      title={title}
      granularity={granularity}
      optionHrefs={view.options.map((g) => ({ granularity: g, href: optionHref(g) }))}
      rows={rows}
      currency={currency}
      summary={
        granularity && view.points.length > 0
          ? `${TREND_LABELS[granularity]} net spending across ${view.points.length} ${granularity}s. Highest: ${money(peak.chartPaise)} around ${bucketLabel(peak.from, granularity)}.`
          : "Spending trend"
      }
      sparseReason={view.sparseReason}
      note={
        view.hasNetRefundBucket
          ? "Where refunds exceeded purchases, the bar is drawn at zero. The table shows the exact amount."
          : null
      }
    />
  );
}

function CategoryRow({
  group,
  categoriesById,
  shareBp,
  selection,
  money,
  scope,
}: {
  group: CategoryGroup;
  categoriesById: ReadonlyMap<string, Category>;
  shareBp: number | null;
  selection: InsightSelection;
  money: (paise: Paise) => string;
  scope: Pick<SpendingScope, "from" | "to">;
}) {
  const unassigned = group.key === UNCATEGORIZED;
  const category = categoriesById.get(group.key);
  const display = spendingDisplay(group, money);
  const hasSubs = group.subcategories.some((s) => s.key !== UNCATEGORIZED);
  return (
    <li className="flex flex-col gap-1" data-testid="category-row" data-paise={group.netPaise}>
      <RowLink href={insightHref(`/insights/category/${group.key}`, selection)}>
        <span className="flex items-center gap-3">
          <CategoryBadge icon={category?.icon ?? null} color={category?.color ?? null} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">
                {unassigned ? UNASSIGNED_LABEL : (category?.name ?? "Removed category")}
              </span>
              <span className="tabular shrink-0 font-semibold">{money(group.netPaise)}</span>
            </span>
            <ShareBar bp={shareBp} color={category?.color ?? null} />
            <span className="tabular text-xs text-muted-foreground">
              {[
                shareBp === null ? null : formatBasisPoints(shareBp, 0),
                countText(group.count),
                group.count >= 2 && group.averagePaise !== null
                  ? `average ${money(group.averagePaise)}`
                  : null,
                group.count >= 3 && group.medianPaise !== null
                  ? `median ${money(group.medianPaise)}`
                  : null,
                group.refundsPaise > 0 ? `${money(group.refundsPaise)} refunded` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>
      </RowLink>
      {display.note && <NoteLine>{display.note}</NoteLine>}
      {unassigned && (
        <Link
          href={UNCATEGORIZED_QUEUE}
          className="ml-11 self-start text-sm font-medium text-primary underline"
        >
          Sort these in the Uncategorized queue
        </Link>
      )}
      {hasSubs && (
        <ul className="ml-9 flex flex-col">
          {group.subcategories.map((sub) => {
            const none = sub.key === UNCATEGORIZED;
            return (
              <li key={sub.key}>
                <RowLink
                  href={historyHref({
                    type: "spending",
                    ...scope,
                    category: none ? group.key : sub.key,
                    noSubcategory: none,
                  })}
                  testId="subcategory-row"
                >
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-muted-foreground">
                      {none ? "No subcategory" : (categoriesById.get(sub.key)?.name ?? "Removed")}
                    </span>
                    <span className="tabular shrink-0">
                      {money(sub.netPaise)}
                      <span className="text-muted-foreground">
                        {" "}
                        · {countText(sub.count)}
                        {sub.shareBp === null ? "" : ` · ${formatBasisPoints(sub.shareBp, 0)}`}
                      </span>
                    </span>
                  </span>
                </RowLink>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function CategorySection({
  breakdown,
  categories,
  selection,
  money,
}: {
  breakdown: CategoryBreakdown;
  categories: readonly Category[];
  selection: InsightSelection;
  money: (paise: Paise) => string;
}) {
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const shares = chartShares(breakdown.categories);
  const scope = periodScope(breakdown.period);
  const signedOut = breakdown.categories.some((c) => c.netPaise < 0);
  return (
    <Card className="min-w-0 gap-3" data-testid="category-section">
      <h2 className="font-semibold">Where it went</h2>
      <ul className="-mx-2 flex flex-col gap-2">
        {breakdown.categories.map((group) => (
          <CategoryRow
            key={group.key}
            group={group}
            categoriesById={categoriesById}
            shareBp={shares.get(group.key) ?? null}
            selection={selection}
            money={money}
            scope={scope}
          />
        ))}
      </ul>
      {signedOut && (
        <NoteLine>
          Percentages here are shares of the categories with net spending, so refunds from an
          earlier period don’t push them above 100%.
        </NoteLine>
      )}
    </Card>
  );
}

export function NoInsights({ words }: { words: InsightWords }) {
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="no-insights">
      <Inbox className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Not enough data for insights {words.period} yet. They appear once purchases repeat or there’s
      something to compare.
    </p>
  );
}

export function ChangeArrow({ up }: { up: boolean }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export function SparkleTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className="size-4 text-primary" aria-hidden="true" />
      <h2 className="font-semibold">{children}</h2>
    </div>
  );
}
