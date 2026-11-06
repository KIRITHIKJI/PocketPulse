import type { Metadata } from "next";
import Link from "next/link";
import { CalendarSearch, ChartPie, Droplets, Zap } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import {
  ComparisonCard,
  FrequentCard,
  RecurringCard,
  UnusualCard,
} from "@/components/insights/insight-panels";
import { FigureLink, NoteLine, PeriodPicker, RowLink } from "@/components/insights/parts";
import {
  CategorySection,
  NoInsights,
  PeriodTrend,
  SparkleTitle,
} from "@/components/insights/sections";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildInsights,
  formatBasisPoints,
  moneyFormatter,
  periodScope,
  toLocalDate,
  UNCATEGORIZED,
} from "@/domain";
import { loadInsightsLedger } from "@/lib/data/insights";
import { getCategories, getProfile } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import {
  UNCATEGORIZED_QUEUE,
  historyHref,
  insightHref,
  insightWords,
  parseGranularity,
  parseInsightSelection,
} from "@/lib/insights-view";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = requestNow();
  const [profile, categories, ledger] = await Promise.all([
    getProfile(),
    getCategories(),
    loadInsightsLedger(params, now),
  ]);
  const settings = { timeZone: profile.timeZone, weekStartsOn: profile.weekStartsOn };
  const today = toLocalDate(now, settings.timeZone);
  const money = moneyFormatter(profile.currency);

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

  const { breakdown, small } = model;
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
        <ComparisonCard model={model} words={words} selection={selection} money={money} />
        <FrequentCard model={model} words={words} spending={spending} money={money} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <UnusualCard model={model} />
        <RecurringCard model={model} money={money} />
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
