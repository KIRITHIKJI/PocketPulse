import Link from "next/link";
import type { Route } from "next";
import { ArrowDownRight, ArrowUpRight, Inbox } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { type TrendRow, NoteLine, RowLink, ShareBar, TrendCard } from "@/components/insights/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
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
import { cn } from "@/lib/utils";

const countText = (n: number, word = "purchase") => `${n} ${word}${n === 1 ? "" : "s"}`;

const PEAK_PHRASE: Record<TrendGranularity, string> = {
  day: "on",
  week: "in the week of",
  month: "in",
};

/**
 * The trend for a period, as the chart card, already linked to its entries. The title states the
 * finding (when spending peaked), picked from the points the chart already draws.
 */
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
  subject,
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
  /** What is charted, starting the title: "Spending", "Food spending". */
  subject: string;
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
  const finding =
    granularity && !view.sparseReason && peak && peak.chartPaise > 0
      ? `${subject} peaked ${PEAK_PHRASE[granularity]} ${bucketLabel(peak.from, granularity)}`
      : `${subject} over time`;
  return (
    <TrendCard
      title={finding}
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

/** One secondary figure in a hero: a label, the value and a hint, opening its entries. */
export function HeroStat({
  href,
  label,
  value,
  hint,
  testId,
}: {
  href: Route | null;
  label: string;
  value: React.ReactNode;
  hint?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span className="type-caption text-muted-foreground">{label}</span>
      <span className="type-body font-semibold money" data-testid={testId}>
        {value}
      </span>
      {hint && <span className="type-caption text-muted-foreground">{hint}</span>}
    </>
  );
  const box = "-m-2 flex min-h-11 min-w-0 flex-col gap-0.5 rounded-lg p-2";
  return href ? (
    <Link
      href={href}
      className={cn(
        box,
        "transition-colors duration-(--duration-quick) outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
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
    <li
      className="flex flex-col gap-1 py-1 first:pt-0 last:pb-0"
      data-testid="category-row"
      data-paise={group.netPaise}
    >
      <RowLink href={insightHref(`/insights/category/${group.key}`, selection)}>
        <span className="flex min-h-10 items-center gap-3">
          <CategoryBadge icon={category?.icon ?? null} color={category?.color ?? null} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-baseline justify-between gap-2 type-body">
              <span className="truncate font-medium">
                {unassigned ? UNASSIGNED_LABEL : (category?.name ?? "Removed category")}
              </span>
              <span className="shrink-0 font-semibold money">{money(group.netPaise)}</span>
            </span>
            <ShareBar bp={shareBp} color={category?.color ?? null} />
            <span className="type-caption text-muted-foreground money">
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
      {display.note && (
        <div className="pl-11">
          <NoteLine>{display.note}</NoteLine>
        </div>
      )}
      {unassigned && (
        <Link
          href={UNCATEGORIZED_QUEUE}
          className="ml-11 inline-flex min-h-11 items-center self-start type-body font-medium text-primary underline underline-offset-2 sm:min-h-0"
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
                  <span className="flex items-baseline justify-between gap-2 type-caption">
                    <span className="truncate text-muted-foreground">
                      {none ? "No subcategory" : (categoriesById.get(sub.key)?.name ?? "Removed")}
                    </span>
                    <span className="shrink-0 money">
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

/** Where the period's spending went: one share bar per category, each opening that category. */
export function CategorySection({
  breakdown,
  categories,
  selection,
  money,
  className,
}: {
  breakdown: CategoryBreakdown;
  categories: readonly Category[];
  selection: InsightSelection;
  money: (paise: Paise) => string;
  className?: string;
}) {
  const categoriesById = new Map(categories.map((c) => [c.id, c]));
  const shares = chartShares(breakdown.categories);
  const scope = periodScope(breakdown.period);
  const signedOut = breakdown.categories.some((c) => c.netPaise < 0);
  const count = breakdown.categories.length;
  return (
    <Surface className={cn("min-w-0", className)} data-testid="category-section">
      <SurfaceHeader
        title="Where it went"
        meta={`${count} ${count === 1 ? "category" : "categories"} · open one for its entries`}
      />
      <ul className="-mx-2 flex flex-col divide-y">
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
    </Surface>
  );
}

export function NoInsights({ words }: { words: InsightWords }) {
  return (
    <div data-testid="no-insights">
      <StatePanel
        size="section"
        icon={Inbox}
        title={`Nothing stands out ${words.period} yet`}
        description="Findings appear once purchases repeat or there’s something to compare."
      />
    </div>
  );
}

export function ChangeArrow({ up }: { up: boolean }) {
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}
