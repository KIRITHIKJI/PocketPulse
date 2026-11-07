import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarSearch, ChartPie, Droplets, Zap } from "lucide-react";

import { TodayReviewed } from "@/components/rewards/today-reviewed";
import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import {
  ComparisonCard,
  ComparisonLine,
  FrequentCard,
  RecurringCard,
  StandoutCard,
  UnusualCard,
} from "@/components/insights/insight-panels";
import { FigureLink, NoteLine, PeriodPicker } from "@/components/insights/parts";
import { CategorySection, HeroStat, PeriodTrend } from "@/components/insights/sections";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
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
  historyHref,
  insightHref,
  insightWords,
  parseGranularity,
  parseInsightSelection,
} from "@/lib/insights-view";

export const metadata: Metadata = { title: "Insights" };

/**
 * Insights (doc/DESIGN_PLAN.md §4): the period total with its comparison beside where it went,
 * then the trend, then the findings. Every figure opens the transactions behind it.
 */
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
  const incomeHref = historyHref({ type: "income", ...scope });

  const header = (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <PageHeader
          title="Insights"
          description="Where your money went. Every number opens the transactions behind it."
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
      <SectionTabs section="insights" />
      {selection.kind === "today" && <TodayReviewed today={today} />}
    </>
  );

  if (model.status !== "ready") {
    return (
      <>
        {header}
        {model.status === "no_spending" ? (
          <StatePanel
            icon={ChartPie}
            title="Not enough data for insights yet"
            description="Insights appear after a few purchases. Log 3 to see your first breakdown."
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
        {model.income.count > 0 && (
          <section aria-label="Income" className="grid gap-3 sm:grid-cols-2">
            <FigureLink
              href={incomeHref}
              label={`Income ${words.period}`}
              value={money(model.income.paise)}
              hint="Shown separately. Income never offsets spending here."
              testId="insights-income"
            />
          </section>
        )}
      </>
    );
  }

  const { breakdown, small } = model;
  const unassigned = breakdown.categories.find((c) => c.key === UNCATEGORIZED);
  const hasIncome = model.income.count > 0;

  return (
    <>
      {header}

      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Surface variant="hero" role="region" aria-label="Totals" className="min-w-0 lg:col-span-5">
          <div className="flex flex-col gap-1">
            <h2 className="type-caption text-muted-foreground">Net spending {words.period}</h2>
            <Link
              href={historyHref(spending)}
              className="self-start rounded-lg outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <span className="type-display money" data-testid="insights-net">
                {money(breakdown.netPaise)}
              </span>
            </Link>
            <p className="type-caption text-muted-foreground">
              {breakdown.refundsPaise > 0 ? (
                <>
                  <span className="money">{money(breakdown.grossPaise)}</span> spent,{" "}
                  <span className="money">{money(breakdown.refundsPaise)}</span> refunded
                </>
              ) : (
                "Expenses minus refunds"
              )}
            </p>
          </div>
          <ComparisonLine model={model} words={words} money={money} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            <HeroStat
              href={historyHref(spending)}
              label="Purchases"
              value={breakdown.expenseCount}
              hint={
                model.averagePaise === null
                  ? "Average needs at least 2 purchases"
                  : `Average ${money(model.averagePaise)}${model.medianPaise === null ? "" : ` · median ${money(model.medianPaise)}`}`
              }
              testId="insights-count"
            />
            <HeroStat
              href={
                small.count > 0
                  ? historyHref({ ...spending, underPaise: small.thresholdPaise })
                  : null
              }
              label={`Small, under ${money(small.thresholdPaise)}`}
              value={money(small.netPaise)}
              hint={`${small.count} ${small.count === 1 ? "purchase" : "purchases"}${small.shareBp === null ? "" : ` · ${formatBasisPoints(small.shareBp, 0)} of spending`}`}
              testId="insights-small"
            />
            <HeroStat
              href={hasIncome ? incomeHref : null}
              label={`Income ${words.period}`}
              value={hasIncome ? money(model.income.paise) : "None recorded"}
              hint="Shown separately from spending"
              testId={hasIncome ? "insights-income" : undefined}
            />
          </div>
          {breakdown.refundsPaise > 0 && (
            <NoteLine>
              Refunds reduce the category of the purchase, in the period the refund happened.{" "}
              <Link
                href={historyHref({ type: "refund", ...scope })}
                className="underline underline-offset-2"
              >
                See <span className="money">{money(breakdown.refundsPaise)}</span> of refunds
              </Link>
            </NoteLine>
          )}
        </Surface>

        <CategorySection
          breakdown={breakdown}
          categories={categories}
          selection={selection}
          money={money}
          className="lg:col-span-7"
        />
      </div>

      <PeriodTrend
        subject="Spending"
        ledger={ledger}
        period={period}
        today={today}
        settings={settings}
        requested={parseGranularity(params.trend)}
        scope={{ type: "spending" }}
        optionHref={(g) => insightHref("/insights", selection, `&trend=${g}`)}
        currency={profile.currency}
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="min-w-0 lg:col-span-2">
          <StandoutCard model={model} words={words} />
        </div>
        <FrequentCard model={model} words={words} spending={spending} money={money} />
        <UnusualCard model={model} />
        <RecurringCard model={model} money={money} />
        <ComparisonCard model={model} words={words} selection={selection} money={money} />
      </div>

      <Surface className="min-w-0">
        <SurfaceHeader
          className="flex-wrap items-center"
          title={
            <span className="flex items-center gap-2">
              <Droplets className="size-4 text-muted-foreground" aria-hidden="true" />
              Money leaks
            </span>
          }
          meta={`Repeated small purchases ${words.period}, with a what-if calculator.`}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link href={insightHref("/insights/leaks", selection)}>
                See money leaks
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          }
        />
      </Surface>

      {unassigned && (
        <NoteLine>
          Unassigned entries are counted in every total above and stay their own group, never part
          of another category.
        </NoteLine>
      )}
    </>
  );
}
