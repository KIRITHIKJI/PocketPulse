import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { PeriodPicker } from "@/components/insights/parts";
import { PageHeader } from "@/components/layout/page-header";
import { FigureRow, Meter, PlanNote } from "@/components/plan/parts";
import { CopyReportText } from "@/components/reports/copy-report-text";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type ParentReport,
  REPORT_DEFINITIONS,
  REPORT_TYPE_LABELS,
  formatBasisPoints,
  formatMoney,
  hiddenRowLabel,
  ratioBasisPoints,
  reportDifferences,
  reportSubcategories,
  reportText,
} from "@/domain";
import { hasLedgerEntries } from "@/lib/data/queries";
import { formatLocalDate } from "@/lib/format";
import { periodQuery } from "@/lib/insights-view";
import { mainExpenseCategories } from "@/lib/plan-view";
import { loadReport } from "@/lib/reports/load";
import { reportQuery } from "@/lib/reports/params";

export const metadata: Metadata = { title: "Parent report" };

function OptionBox({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="hidden" name={name} value="0" />
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="size-4 accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

function Summary({ report, money }: { report: ParentReport; money: (paise: number) => string }) {
  return (
    <dl className="divide-y">
      <FigureRow
        label={
          report.openingAsOf
            ? `Opening balance · ${formatLocalDate(report.openingAsOf)}`
            : "Opening balances"
        }
        value={money(report.openingPaise)}
        testId="report-opening"
      />
      {report.newlyTrackedPaise !== 0 && (
        <FigureRow
          label="Wallets added during the period"
          value={money(report.newlyTrackedPaise)}
          explanation="Their opening balances, from the day each one starts."
        />
      )}
      <FigureRow
        label={`Income · ${report.incomeCount}`}
        value={money(report.incomePaise)}
        testId="report-income"
      />
      <FigureRow
        label={`Expenses · ${report.expenseCount}`}
        value={`−${money(report.expensesPaise)}`}
        testId="report-expenses"
      />
      <FigureRow
        label={`Refunds · ${report.refundCount}`}
        value={money(report.refundsPaise)}
        testId="report-refunds"
      />
      <FigureRow
        label="Net movement"
        value={money(report.netMovementPaise)}
        testId="report-net"
        explanation="Income plus refunds, minus expenses."
      />
      {report.beforeTrackingPaise !== 0 && (
        <FigureRow
          label="Entries already in opening balances"
          value={money(-report.beforeTrackingPaise)}
          explanation="Dated before their wallet’s opening date, so they count as spending but don’t change the balance."
        />
      )}
      <FigureRow
        label={`${report.provisional ? "Balance so far" : "Closing balance"} · ${formatLocalDate(report.closingAsOf)}`}
        value={money(report.closingPaise)}
        testId="report-closing"
        strong
        explanation={
          report.provisional
            ? "The period is still running, so this is the balance now."
            : "The balance at the end of that day, rebuilt from dated entries."
        }
      />
    </dl>
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
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });
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
          <Card className="gap-3">
            <h2 className="font-semibold">What to include</h2>
            <form method="get" action="/reports" className="flex flex-col gap-3">
              <input type="hidden" name="period" value={selection.kind} />
              {selection.kind === "custom" && (
                <>
                  <input type="hidden" name="from" value={selection.customFrom} />
                  <input type="hidden" name="to" value={selection.customTo} />
                </>
              )}
              <div className="flex flex-wrap gap-x-5">
                <OptionBox
                  name="details"
                  label="Every entry"
                  checked={options.includeTransactions}
                />
                <OptionBox name="notes" label="Notes" checked={options.includeNotes} />
                <OptionBox
                  name="compare"
                  label="Compare with the earlier period"
                  checked={options.compare}
                />
              </div>
              <details>
                <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">
                  Hide categories
                  {options.hiddenCategoryIds.length > 0
                    ? ` (${options.hiddenCategoryIds.length} hidden)`
                    : ""}
                </summary>
                <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
                  {mainExpenseCategories(categories).map((category) => (
                    <label key={category.id} className="flex min-h-10 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="hide"
                        value={category.id}
                        defaultChecked={options.hiddenCategoryIds.includes(category.id)}
                        className="size-4 accent-[var(--primary)]"
                      />
                      {category.name}
                    </label>
                  ))}
                </div>
                <p className="pb-2 text-xs text-muted-foreground">
                  A hidden category’s name and entries are left out. Its money stays in the totals,
                  under “{hiddenRowLabel()}”, so the report still adds up.
                </p>
              </details>
              <Button type="submit" variant="outline" className="self-start">
                Update preview
              </Button>
            </form>
          </Card>

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
