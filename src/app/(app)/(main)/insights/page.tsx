import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch, ChartPie, Droplets, Repeat, TriangleAlert, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { FigureLink, NoteLine, PeriodPicker, RowLink } from "@/components/insights/parts";
import {
  CategorySection,
  ChangeArrow,
  NoInsights,
  PeriodTrend,
  SparkleTitle,
} from "@/components/insights/sections";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  UNCATEGORIZED,
  buildInsights,
  formatBasisPoints,
  formatMoney,
  periodScope,
  toLocalDate,
} from "@/domain";
import { getCategories, getLedger, getProfile } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { formatLocalDate } from "@/lib/format";
import {
  UNCATEGORIZED_QUEUE,
  historyHref,
  insightHref,
  insightWords,
  parseGranularity,
  parseInsightSelection,
} from "@/lib/insights-view";

export const metadata: Metadata = { title: "Insights" };

const CADENCE = { weekly: "weekly", monthly: "monthly", regular: "regular" } as const;

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [profile, categories, ledger] = await Promise.all([
    getProfile(),
    getCategories(),
    getLedger(),
  ]);
  const now = requestNow();
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const today = toLocalDate(now, settings.timeZone);
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });

  const selection = parseInsightSelection(params, now, settings);
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
  const scope = periodScope(period);
  const spending = { type: "spending", ...scope } as const;

  const header = (
    <>
      <PageHeader
        title="Insights"
        description="Where your money goes by category, merchant and period. Every number opens the transactions behind it."
      />
      <SectionTabs section="insights" />
      <PeriodPicker
        kind={selection.kind}
        customFrom={selection.customFrom}
        customTo={selection.customTo}
        error={selection.error}
      />
    </>
  );

  const income = model.income.count > 0 && (
    <FigureLink
      href={historyHref({ type: "income", ...scope })}
      label={`Income ${words.period}`}
      value={money(model.income.paise)}
      hint="Shown separately. Income never offsets spending here."
      testId="insights-income"
    />
  );

  if (model.status !== "ready") {
    return (
      <>
        {header}
        {model.status === "no_spending" ? (
          <StatePanel
            icon={ChartPie}
            title="Not enough data for insights yet"
            description="Insights only appear when real purchases support them. Record a few and they’ll start here."
            actions={
              <Button asChild>
                <Link href="/add">
                  <Zap aria-hidden="true" />
                  Quick add
                </Link>
              </Button>
            }
          />
        ) : (
          <StatePanel
            icon={CalendarSearch}
            title={`Nothing recorded ${words.period}`}
            description="You have spending in other periods. Pick another one, or look at everything."
            actions={
              <Button variant="outline" asChild>
                <Link href={{ pathname: "/insights", query: { period: "all_time" } }}>
                  See all time
                </Link>
              </Button>
            }
          />
        )}
        {income && <section className="grid gap-3 sm:grid-cols-2">{income}</section>}
      </>
    );
  }

  const { breakdown, comparison, small } = model;
  const unassigned = breakdown.categories.find((c) => c.key === UNCATEGORIZED);

  return (
    <>
      {header}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FigureLink
          href={historyHref(spending)}
          label={`Net spending ${words.period}`}
          value={money(breakdown.netPaise)}
          hint={
            breakdown.refundsPaise > 0
              ? `${money(breakdown.grossPaise)} spent, ${money(breakdown.refundsPaise)} refunded`
              : "Expenses minus refunds"
          }
          testId="insights-net"
        />
        <FigureLink
          href={historyHref({ ...spending })}
          label="Purchases"
          value={breakdown.expenseCount}
          hint={
            model.averagePaise === null
              ? "Average needs at least 2 purchases"
              : `Average ${money(model.averagePaise)}${model.medianPaise === null ? "" : ` · median ${money(model.medianPaise)}`}`
          }
          testId="insights-count"
        />
        <FigureLink
          href={
            small.count > 0 ? historyHref({ ...spending, underPaise: small.thresholdPaise }) : null
          }
          label={`Small purchases (under ${money(small.thresholdPaise)})`}
          value={money(small.netPaise)}
          hint={`${small.count} ${small.count === 1 ? "purchase" : "purchases"}${small.shareBp === null ? "" : ` · ${formatBasisPoints(small.shareBp, 0)} of spending`}`}
          testId="insights-small"
        />
        {income || (
          <FigureLink
            href={null}
            label={`Income ${words.period}`}
            value="None recorded"
            hint="Shown separately from spending"
          />
        )}
      </section>
      {breakdown.refundsPaise > 0 && (
        <NoteLine>
          Refunds reduce the category of the purchase, in the period the refund happened.{" "}
          <Link href={historyHref({ type: "refund", ...scope })} className="underline">
            See {money(breakdown.refundsPaise)} of refunds
          </Link>
        </NoteLine>
      )}

      <Card className="min-w-0 gap-3" data-testid="insight-cards">
        <SparkleTitle>What stands out</SparkleTitle>
        {model.cards.length === 0 ? (
          <NoInsights words={words} />
        ) : (
          <ul className="-mx-2 flex flex-col">
            {model.cards.map((card) => (
              <li key={card.id}>
                <RowLink href={historyHref(card.scope)} testId="insight-card">
                  <span className="text-sm">{card.text}</span>
                </RowLink>
                {card.kind === "unassigned" && (
                  <Link
                    href={UNCATEGORIZED_QUEUE}
                    className="ml-2 text-sm font-medium text-primary underline"
                  >
                    Open the Uncategorized queue
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PeriodTrend
        title="Spending over time"
        ledger={ledger}
        period={period}
        today={today}
        settings={settings}
        requested={parseGranularity(params.trend)}
        scope={{ type: "spending" }}
        optionHref={(g) => insightHref("/insights", selection, `&trend=${g}`)}
        currency={profile.currency}
      />
      <CategorySection
        breakdown={breakdown}
        categories={categories}
        selection={selection}
        money={money}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-3" data-testid="comparison">
          <h2 className="font-semibold">
            {words.previous ? `Compared with ${words.previous}` : "Compared with before"}
          </h2>
          {comparison?.comparable && model.previousWindow ? (
            <>
              <p className="text-sm">
                <span className="tabular font-semibold">
                  {money(comparison.total.currentPaise)}
                </span>{" "}
                against{" "}
                <Link
                  href={historyHref({ type: "spending", ...periodScope(model.previousWindow) })}
                  className="tabular underline"
                >
                  {money(comparison.total.previousPaise)}
                </Link>{" "}
                ({formatLocalDate(model.previousWindow.startDate!)} to{" "}
                {formatLocalDate(model.previousWindow.endDate!)}).{" "}
                {comparison.total.deltaPaise === 0
                  ? "The same."
                  : `${money(Math.abs(comparison.total.deltaPaise))} ${comparison.total.deltaPaise > 0 ? "more" : "less"}.`}
              </p>
              {model.changes.length > 0 && (
                <ul className="-mx-2 flex flex-col">
                  {model.changes.slice(0, 5).map((item) => (
                    <li key={item.key}>
                      <RowLink href={insightHref(`/insights/category/${item.key}`, selection)}>
                        <span className="flex items-center gap-2 text-sm">
                          <ChangeArrow up={item.deltaPaise > 0} />
                          <span className="min-w-0 flex-1 truncate">{words.labelOf(item.key)}</span>
                          <span className="tabular shrink-0">
                            {money(item.previousPaise)} → {money(item.currentPaise)}
                          </span>
                        </span>
                      </RowLink>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="compare-sparse">
              Not enough data to compare yet. {model.comparisonNote}
            </p>
          )}
        </Card>

        <Card className="min-w-0 gap-3" data-testid="frequent">
          <h2 className="font-semibold">Most frequent</h2>
          {model.frequent.length === 0 && model.merchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has repeated yet {words.period}.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {[...model.frequent, ...model.merchants].map((group) => (
                <li key={`${group.by}:${group.key}`}>
                  <RowLink
                    href={historyHref({ ...spending, by: group.by, key: group.key })}
                    testId="frequent-row"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">
                        {group.label}
                        {group.by === "merchant" && (
                          <span className="text-muted-foreground"> · merchant</span>
                        )}
                      </span>
                      <span className="tabular shrink-0">
                        {group.count}× · {money(group.netPaise)}
                      </span>
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0 gap-3" data-testid="unusual">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
            <h2 className="font-semibold">Unusual changes</h2>
          </div>
          {model.unusual.length === 0 ? (
            <p className="text-sm text-muted-foreground">{model.unusualNote}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {model.unusual.map((item) => (
                <li key={item.key} className="flex flex-col gap-1 text-sm">
                  <Link href={historyHref(item.scope)} className="underline">
                    {item.text}
                  </Link>
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      How we detected this
                    </summary>
                    <p className="mt-1 text-xs text-muted-foreground">{item.how}</p>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="min-w-0 gap-3" data-testid="recurring">
          <div className="flex items-center gap-2">
            <Repeat className="size-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Looks recurring</h2>
          </div>
          {model.recurring.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No regular pattern yet. A purchase needs at least 3 evenly spaced dates to show here.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {model.recurring.map((signal) => (
                <li key={`${signal.by}:${signal.key}`}>
                  <RowLink
                    href={historyHref({
                      type: "spending",
                      from: null,
                      to: null,
                      by: signal.by,
                      key: signal.key,
                    })}
                  >
                    <span className="text-sm">
                      {signal.label} looks {CADENCE[signal.cadence]}
                      {signal.cadence === "regular"
                        ? ` (about every ${signal.everyDays} days)`
                        : ""}
                      : {signal.count} payments of about {money(signal.typicalPaise)}, last on{" "}
                      {formatLocalDate(signal.lastDate)}.
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
          <NoteLine>A signal from your dates and amounts across all history, not a fact.</NoteLine>
        </Card>
      </div>

      <Card className="flex-row flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <Droplets className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-sm">
            See repeated small purchases {words.period}, with a what-if calculator.
          </span>
        </span>
        <Button variant="outline" asChild>
          <Link href={insightHref("/insights/leaks", selection)}>Money leaks</Link>
        </Button>
      </Card>

      {unassigned && (
        <NoteLine>
          Unassigned entries are counted in every total above and stay their own group, never part
          of another category.
        </NoteLine>
      )}
    </>
  );
}
