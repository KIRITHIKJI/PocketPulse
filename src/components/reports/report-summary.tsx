import { FigureRow } from "@/components/plan/parts";
import type { ParentReport } from "@/domain";
import { formatLocalDate } from "@/lib/format";

/** The report summary: balances, income, spending and refunds, as a definition list. */
export function Summary({
  report,
  money,
}: {
  report: ParentReport;
  money: (paise: number) => string;
}) {
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
