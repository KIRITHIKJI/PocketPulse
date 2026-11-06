import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { PeriodPicker } from "@/components/insights/parts";
import { PageHeader } from "@/components/layout/page-header";
import { Meter, PlanNote } from "@/components/plan/parts";
import { CopyReportText } from "@/components/reports/copy-report-text";
import { ReportOptionsForm } from "@/components/reports/report-options";
import { Summary } from "@/components/reports/report-summary";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export const metadata: Metadata = { title: "Parent report" };

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
  const empty = !anyEntries;
  const differences = reportDifferences(report);
  const balanced = Object.values(differences).every((d) => d === 0);

  return (
    <>
      <PageHeader
        title="Parent report"
        description="Pick a period, review the numbers, and choose exactly what to export. Nothing is ever sent automatically."
      />
      <PeriodPicker
        kind={selection.kind}
        customFrom={selection.customFrom}
        customTo={selection.customTo}
        error={selection.error}
        extra={`&${query.replace(periodQuery(selection), "").replace(/^&/, "")}`}
      />

      {empty ? (
        <StatePanel
          icon={FileText}
          title="No activity to report"
          description="Reports show opening and closing balances, income, spending, refunds and category totals for the period you choose. Record an entry to get started."
        />
      ) : (
        <>
          <ReportOptionsForm selection={selection} options={options} categories={categories} />

          <section aria-label="Report preview" className="flex flex-col gap-4" data-testid="report">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="min-w-0 gap-2">
                <h2 className="font-semibold">Summary</h2>
                <p className="text-sm text-muted-foreground" data-testid="report-period">
                  {report.periodLabel} · {report.currency}
                </p>
                <Summary report={report} money={money} />
                {(report.setAsidePaise > 0 ||
                  report.releasedPaise > 0 ||
                  report.transferredPaise > 0) && (
                  <p className="text-xs text-muted-foreground">
                    Not spending: {money(report.setAsidePaise)} set aside for goals,{" "}
                    {money(report.releasedPaise)} released, {money(report.transferredPaise)} moved
                    between wallets.
                  </p>
                )}
              </Card>

              <Card className="min-w-0 gap-2">
                <h2 className="font-semibold">Spending by category</h2>
                {report.categories.length === 0 && !report.hiddenRow ? (
                  <p className="text-sm text-muted-foreground">Nothing was spent in this period.</p>
                ) : (
                  <ul className="flex flex-col gap-3" data-testid="report-categories">
                    {report.categories.map((row) => (
                      <li key={row.key} className="flex flex-col gap-1">
                        <p className="flex justify-between gap-3 text-sm">
                          <span className="truncate font-medium">{row.label}</span>
                          <span className="tabular shrink-0">
                            {money(row.netPaise)}
                            {row.shareBp === null
                              ? ""
                              : ` · ${formatBasisPoints(row.shareBp, 0)}`}{" "}
                            · {row.count} ×
                          </span>
                        </p>
                        <Meter
                          bp={ratioBasisPoints(Math.max(0, row.netPaise), largest) ?? 0}
                          tone="primary"
                        />
                        {reportSubcategories(row).map((sub) => (
                          <p
                            key={sub.key}
                            className="tabular flex justify-between gap-3 text-xs text-muted-foreground"
                          >
                            <span className="truncate">{sub.label}</span>
                            <span className="shrink-0">
                              {money(sub.netPaise)} · {sub.count} ×
                            </span>
                          </p>
                        ))}
                      </li>
                    ))}
                    {report.hiddenRow && (
                      <li className="flex justify-between gap-3 text-sm">
                        <span className="font-medium">{hiddenRowLabel()}</span>
                        <span className="tabular shrink-0">
                          {money(report.hiddenRow.netPaise)} · {report.hiddenRow.count} ×
                        </span>
                      </li>
                    )}
                  </ul>
                )}
              </Card>
            </div>

            {report.comparison && (
              <Card className="gap-2" data-testid="report-comparison">
                <h2 className="font-semibold">Compared with {report.comparison.label}</h2>
                <p className="text-sm">
                  Spending {money(report.comparison.spending.currentPaise)} against{" "}
                  {money(report.comparison.spending.previousPaise)}. Income{" "}
                  {money(report.comparison.income.currentPaise)} against{" "}
                  {money(report.comparison.income.previousPaise)}.
                </p>
                {report.comparison.sparse && (
                  <p className="text-xs text-muted-foreground">
                    Too few purchases to read much into this.
                  </p>
                )}
              </Card>
            )}

            {report.transactions && (
              <Card className="min-w-0 gap-2" data-testid="report-entries">
                <h2 className="font-semibold">Entries · {report.transactions.length}</h2>
                {report.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No entries in this period.</p>
                ) : (
                  <ul className="divide-y">
                    {report.transactions.map((row) => (
                      <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                        <span className="min-w-0 text-sm">
                          <span className="block truncate font-medium">
                            {row.description || REPORT_TYPE_LABELS[row.type]}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatLocalDate(row.date)}
                            {row.category ? ` · ${row.category}` : ""} · {row.wallet}
                          </span>
                          {row.note && (
                            <span className="block text-xs text-muted-foreground">{row.note}</span>
                          )}
                        </span>
                        <span className="tabular shrink-0 text-sm">
                          {row.signedPaise < 0 ? "−" : ""}
                          {money(row.amountPaise)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </section>

          <Card className="gap-3" data-testid="report-exports">
            <h2 className="font-semibold">Export what you’ve reviewed</h2>
            <p className="text-sm text-muted-foreground">
              Each export contains exactly the preview above and saves to this device. Nothing is
              sent to anyone; sharing it is up to you.
            </p>
            {!balanced && (
              <p role="alert" className="text-sm text-destructive">
                These figures don’t add up, so please don’t share this report. Reload and try again.
              </p>
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
          </Card>

          <details className="rounded-2xl border bg-card p-4">
            <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">
              What these figures mean
            </summary>
            <dl className="flex flex-col gap-1 pt-2 text-sm">
              {REPORT_DEFINITIONS.map(([term, meaning]) => (
                <div key={term}>
                  <dt className="inline font-medium">{term}: </dt>
                  <dd className="inline text-muted-foreground">{meaning}</dd>
                </div>
              ))}
            </dl>
          </details>
          <PlanNote>
            Want to check a figure? The same period in{" "}
            <Link
              href={`/insights?${periodQuery(selection)}` as Route}
              className="underline underline-offset-4"
            >
              Insights
            </Link>{" "}
            shows the same totals.
          </PlanNote>
        </>
      )}
    </>
  );
}
