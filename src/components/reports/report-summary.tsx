import type { ParentReport } from "@/domain";
import { formatLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One line of the summary: what it is, the figure, and how that figure was reached. */
function Row({
  label,
  value,
  explanation,
  testId,
  strong,
}: {
  label: string;
  value: string;
  explanation?: string;
  testId?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt
        className={cn("min-w-0 flex-1 type-body", strong ? "font-semibold" : "text-text-secondary")}
      >
        {label}
      </dt>
      <dd
        className={cn("shrink-0 money", strong ? "type-heading" : "type-body")}
        data-testid={testId}
      >
        {value}
      </dd>
      {explanation && <dd className="basis-full type-caption text-text-tertiary">{explanation}</dd>}
    </div>
  );
}

/** The report summary: balances, income, spending and refunds, as a definition list. */
export function Summary({
  report,
  money,
}: {
  report: ParentReport;
  money: (paise: number) => string;
}) {
  return (
    <dl className="-my-2.5 divide-y">
      <Row
        label={
          report.openingAsOf
            ? `Opening balance · ${formatLocalDate(report.openingAsOf)}`
            : "Opening balances"
        }
        value={money(report.openingPaise)}
        testId="report-opening"
      />
      {report.newlyTrackedPaise !== 0 && (
        <Row
          label="Wallets added during the period"
          value={money(report.newlyTrackedPaise)}
          explanation="Their opening balances, from the day each one starts."
        />
      )}
      <Row
        label={`Income · ${report.incomeCount}`}
        value={money(report.incomePaise)}
        testId="report-income"
      />
      <Row
        label={`Expenses · ${report.expenseCount}`}
        value={report.expensesPaise > 0 ? `−${money(report.expensesPaise)}` : money(0)}
        testId="report-expenses"
      />
      <Row
        label={`Refunds · ${report.refundCount}`}
        value={money(report.refundsPaise)}
        testId="report-refunds"
      />
      <Row
        label="Net movement"
        value={money(report.netMovementPaise)}
        testId="report-net"
        explanation="Income plus refunds, minus expenses."
      />
      {report.beforeTrackingPaise !== 0 && (
        <Row
          label="Entries already in opening balances"
          value={money(-report.beforeTrackingPaise)}
          explanation="Dated before their wallet’s opening date, so they count as spending but don’t change the balance."
        />
      )}
      <Row
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
