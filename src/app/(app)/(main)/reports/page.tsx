import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { PeriodPicker } from "@/components/insights/parts";
import { PageHeader } from "@/components/layout/page-header";
import { CopyReportText } from "@/components/reports/copy-report-text";
import { ReportOptionsForm } from "@/components/reports/report-options";
import { Summary } from "@/components/reports/report-summary";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  formatBasisPoints,
  hiddenRowLabel,
  moneyFormatter,
  ratioBasisPoints,
  REPORT_DEFINITIONS,
  REPORT_TYPE_LABELS,
  reportDifferences,
  reportSubcategories,
  reportText,
} from "@/domain";
import { hasLedgerEntries } from "@/lib/data/queries";
import { formatLocalDate } from "@/lib/format";
import { periodQuery } from "@/lib/insights-view";
import { loadReport } from "@/lib/reports/load";
import { reportQuery } from "@/lib/reports/params";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Parent report" };

/** A titled part of the one paper-like preview; parts are separated by a rule, not nested cards. */
function PreviewPart({
  title,
  testId,
  children,
}: {
  title: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 border-t pt-stack" data-testid={testId}>
      <h3 className="type-heading">{title}</h3>
      {children}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [{ profile, categories, report, selection, options }, anyEntries] = await Promise.all([
    loadReport(params),
    hasLedgerEntries(),
  ]);
  const money = moneyFormatter(profile.currency);
  const query = reportQuery(selection, options);
  const exportHref = (format: "pdf" | "csv") =>
    `/reports/export?format=${format}&${query}` as Route;
  const largest = Math.max(1, ...report.categories.map((c) => Math.max(0, c.netPaise)));
  const differences = reportDifferences(report);
  const balanced = Object.values(differences).every((d) => d === 0);
  const nothingInPeriod =
    report.incomeCount + report.expenseCount + report.refundCount === 0 &&
    report.transferredPaise === 0 &&
    report.setAsidePaise === 0 &&
    report.releasedPaise === 0;

  return (
    <>
      <PageHeader
        title="Parent report"
        description="Review the numbers, choose what to include, then export. Nothing is sent automatically."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,45rem)] lg:items-start lg:gap-6">
        {/* The preview comes first in the page, so phones see the answer before the options. */}
        <div className="flex min-w-0 flex-col gap-4">
          <Surface data-testid="report-exports">
            <SurfaceHeader
              title="Export what you’ve reviewed"
              meta="Each export contains exactly the preview below and saves to this device. Nothing is sent to anyone; sharing it is up to you."
            />
            {!balanced && (
              <Notice tone="error" title="These figures don’t add up">
                Please don’t share this report. Reload and try again.
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={exportHref("pdf")} download>
                  <Download aria-hidden="true" />
                  Download PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={exportHref("csv")} download>
                  <FileSpreadsheet aria-hidden="true" />
                  Download CSV
                </a>
              </Button>
              <CopyReportText text={reportText(report, money, formatLocalDate)} />
            </div>
          </Surface>

          <Surface asChild>
            <section aria-label="Report preview" data-testid="report">
              <div className="flex flex-col gap-0.5">
                <h2 className="type-heading">Spending report</h2>
                <p className="type-caption text-text-secondary" data-testid="report-period">
                  {report.periodLabel} · {report.currency}
                </p>
              </div>

              {nothingInPeriod && (
                <StatePanel
                  size="section"
                  icon={FileText}
                  title="Nothing recorded in this period"
                  description={
                    anyEntries
                      ? "Pick another period in the options, or record an entry for this one."
                      : "Reports show balances, income, spending, refunds and category totals once you record an entry."
                  }
                  actions={
                    anyEntries ? undefined : (
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/add">Record an entry</Link>
                      </Button>
                    )
                  }
                />
              )}

              <PreviewPart title="Summary">
                <Summary report={report} money={money} />
                {(report.setAsidePaise > 0 ||
                  report.releasedPaise > 0 ||
                  report.transferredPaise > 0) && (
                  <p className="type-caption text-text-secondary">
                    Not spending: <span className="money">{money(report.setAsidePaise)}</span> set
                    aside for goals, <span className="money">{money(report.releasedPaise)}</span>{" "}
                    released, <span className="money">{money(report.transferredPaise)}</span> moved
                    between wallets.
                  </p>
                )}
              </PreviewPart>

              <PreviewPart title="Spending by category">
                {report.categories.length === 0 && !report.hiddenRow ? (
                  <p className="type-body text-muted-foreground">
                    Nothing was spent in this period.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="report-categories">
                    {report.categories.map((row) => (
                      <li key={row.key} className="flex flex-col gap-1">
                        <p className="flex flex-wrap justify-between gap-x-3 type-body">
                          <span className="min-w-0 truncate font-medium">{row.label}</span>
                          <span className="shrink-0 money">
                            {money(row.netPaise)}
                            <span className="text-text-secondary">
                              {row.shareBp === null
                                ? ""
                                : ` · ${formatBasisPoints(row.shareBp, 0)}`}{" "}
                              · {row.count} ×
                            </span>
                          </span>
                        </p>
                        <Progress
                          tone="neutral"
                          bp={ratioBasisPoints(Math.max(0, row.netPaise), largest) ?? 0}
                          aria-label={`${row.label}, compared with the largest category`}
                        />
                        {reportSubcategories(row).map((sub) => (
                          <p
                            key={sub.key}
                            className="flex justify-between gap-3 type-caption text-text-secondary"
                          >
                            <span className="min-w-0 truncate">{sub.label}</span>
                            <span className="shrink-0 money">
                              {money(sub.netPaise)} · {sub.count} ×
                            </span>
                          </p>
                        ))}
                      </li>
                    ))}
                    {report.hiddenRow && (
                      <li className="flex justify-between gap-3 type-body">
                        <span className="font-medium">{hiddenRowLabel()}</span>
                        <span className="shrink-0 money">
                          {money(report.hiddenRow.netPaise)}
                          <span className="text-text-secondary"> · {report.hiddenRow.count} ×</span>
                        </span>
                      </li>
                    )}
                  </ul>
                )}
              </PreviewPart>

              {report.comparison && (
                <PreviewPart
                  title={`Compared with ${report.comparison.label}`}
                  testId="report-comparison"
                >
                  <p className="type-body">
                    Spending{" "}
                    <span className="money">{money(report.comparison.spending.currentPaise)}</span>{" "}
                    against{" "}
                    <span className="money">{money(report.comparison.spending.previousPaise)}</span>
                    . Income{" "}
                    <span className="money">{money(report.comparison.income.currentPaise)}</span>{" "}
                    against{" "}
                    <span className="money">{money(report.comparison.income.previousPaise)}</span>.
                  </p>
                  {report.comparison.sparse && (
                    <p className="type-caption text-text-secondary">
                      Too few purchases to read much into this.
                    </p>
                  )}
                </PreviewPart>
              )}

              {report.transactions && (
                <PreviewPart
                  title={
                    <>
                      Entries · <span className="money">{report.transactions.length}</span>
                    </>
                  }
                  testId="report-entries"
                >
                  {report.transactions.length === 0 ? (
                    <p className="type-body text-muted-foreground">No entries in this period.</p>
                  ) : (
                    <ul className="-my-2 divide-y">
                      {report.transactions.map((row) => (
                        <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                          <span className="min-w-0 type-body">
                            <span className="block truncate font-medium">
                              {row.description || REPORT_TYPE_LABELS[row.type]}
                            </span>
                            <span className="block type-caption text-text-secondary">
                              {formatLocalDate(row.date)}
                              {row.category ? ` · ${row.category}` : ""} · {row.wallet}
                            </span>
                            {row.note && (
                              <span className="block type-caption text-text-secondary">
                                {row.note}
                              </span>
                            )}
                          </span>
                          <span
                            className={cn(
                              "shrink-0 type-body money",
                              (row.type === "income" || row.type === "refund") &&
                                "text-money-positive",
                            )}
                          >
                            {row.signedPaise < 0 ? "−" : ""}
                            {money(row.amountPaise)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </PreviewPart>
              )}
            </section>
          </Surface>
        </div>

        <aside aria-label="Report options" className="flex min-w-0 flex-col gap-4 lg:order-first">
          <Surface>
            {/* Open by default so every option stays one tap away; it can be folded away. */}
            <details open className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2">
                <h2 className="type-heading">Options</h2>
                <ChevronDown
                  className="size-4 text-muted-foreground transition-transform duration-(--duration-quick) group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="flex flex-col gap-stack pt-stack">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="type-caption font-medium text-text-secondary">Period</p>
                  <PeriodPicker
                    kind={selection.kind}
                    customFrom={selection.customFrom}
                    customTo={selection.customTo}
                    error={selection.error}
                    extra={`&${query.replace(periodQuery(selection), "").replace(/^&/, "")}`}
                  />
                </div>
                <ReportOptionsForm
                  selection={selection}
                  options={options}
                  categories={categories}
                />
              </div>
            </details>
          </Surface>

          <Surface variant="inset">
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center type-body font-medium">
                What these figures mean
              </summary>
              <dl className="flex flex-col gap-1.5 pt-1 pb-1 type-body">
                {REPORT_DEFINITIONS.map(([term, meaning]) => (
                  <div key={term}>
                    <dt className="inline font-medium">{term}: </dt>
                    <dd className="inline text-muted-foreground">{meaning}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </Surface>

          <Notice>
            Want to check a figure? The same period in{" "}
            <Link
              href={`/insights?${periodQuery(selection)}` as Route}
              className="text-foreground underline underline-offset-4"
            >
              Insights
            </Link>{" "}
            shows the same totals.
          </Notice>
        </aside>
      </div>
    </>
  );
}
