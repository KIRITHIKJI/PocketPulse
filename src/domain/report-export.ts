/** The parent report as CSV and plain text, plus the labels every report format shares. */
import { UNCATEGORIZED } from "./aggregation";
import { csvDocument } from "./csv";
import { type Paise, formatBasisPoints, paiseToDecimalString } from "./money";
import { type LocalDate } from "./time";
import { type ParentReport, type ReportCategoryRow, OTHER_CATEGORIES } from "./report";

export const REPORT_TYPE_LABELS = {
  income: "Income",
  expense: "Expense",
  refund: "Refund",
  transfer: "Transfer",
} as const;

export const hiddenRowLabel = () => OTHER_CATEGORIES;

/** A lone "No subcategory" row would only repeat the category above it. */
export function reportSubcategories(row: ReportCategoryRow) {
  return row.subcategories.length === 1 && row.subcategories[0]!.key === UNCATEGORIZED
    ? []
    : row.subcategories;
}

/**
 * Spreadsheet-ready: amounts are plain decimals with no symbol or grouping. With details on it's
 * one row per entry; without them, one row per category and subcategory.
 */
export function reportCsv(report: ParentReport): string {
  const { currency } = report;
  if (report.transactions) {
    const withNotes = report.options.includeNotes;
    return csvDocument(
      [
        "Date",
        "Time",
        "Type",
        "Description",
        "Category",
        "Wallet",
        "Currency",
        "Amount",
        "Signed amount",
        ...(withNotes ? ["Note"] : []),
      ],
      report.transactions.map((row) => [
        row.date,
        row.time,
        REPORT_TYPE_LABELS[row.type],
        row.description,
        row.category,
        row.wallet,
        currency,
        { number: paiseToDecimalString(row.amountPaise) },
        { number: paiseToDecimalString(row.signedPaise) },
        ...(withNotes ? [row.note ?? ""] : []),
      ]),
    );
  }
  const rows = report.categories.flatMap((c) => [
    [
      c.label,
      "",
      { number: String(c.count) },
      currency,
      { number: paiseToDecimalString(c.grossPaise) },
      { number: paiseToDecimalString(c.refundsPaise) },
      { number: paiseToDecimalString(c.netPaise) },
    ],
    ...c.subcategories.map((s) => [
      c.label,
      s.label,
      { number: String(s.count) },
      currency,
      { number: paiseToDecimalString(s.grossPaise) },
      { number: paiseToDecimalString(s.refundsPaise) },
      { number: paiseToDecimalString(s.netPaise) },
    ]),
  ]);
  if (report.hiddenRow) {
    rows.push([
      OTHER_CATEGORIES,
      "",
      { number: String(report.hiddenRow.count) },
      currency,
      "",
      "",
      { number: paiseToDecimalString(report.hiddenRow.netPaise) },
    ]);
  }
  return csvDocument(
    ["Category", "Subcategory", "Purchases", "Currency", "Spent", "Refunds", "Net"],
    rows,
  );
}

/** A plain summary to paste into a message. Figures only; nothing is sent from here. */
export function reportText(
  report: ParentReport,
  money: (paise: Paise) => string,
  dateText: (date: LocalDate) => string,
): string {
  const lines = [`PocketPulse report: ${report.periodLabel} (${report.currency})`];
  if (report.openingAsOf) {
    lines.push(`Opening balance on ${dateText(report.openingAsOf)}: ${money(report.openingPaise)}`);
  } else {
    lines.push(`Opening balances: ${money(report.openingPaise)}`);
  }
  if (report.newlyTrackedPaise !== 0) {
    lines.push(`Wallets added during the period: ${money(report.newlyTrackedPaise)}`);
  }
  lines.push(
    `Income: ${money(report.incomePaise)}`,
    `Expenses: ${money(report.expensesPaise)}`,
    `Refunds: ${money(report.refundsPaise)}`,
    `Net movement: ${money(report.netMovementPaise)}`,
  );
  if (report.beforeTrackingPaise !== 0) {
    lines.push(`Entries already in opening balances: ${money(report.beforeTrackingPaise)}`);
  }
  lines.push(
    `${report.provisional ? "Balance so far" : "Closing balance"} on ${dateText(report.closingAsOf)}: ${money(report.closingPaise)}`,
  );
  if (report.categories.length > 0 || report.hiddenRow) {
    lines.push("", "Spending by category:");
    for (const c of report.categories) {
      const share = c.shareBp === null ? "" : ` (${formatBasisPoints(c.shareBp, 0)})`;
      lines.push(`- ${c.label}: ${money(c.netPaise)}${share}`);
    }
    if (report.hiddenRow) {
      lines.push(`- ${OTHER_CATEGORIES}: ${money(report.hiddenRow.netPaise)}`);
    }
  }
  if (report.comparison) {
    lines.push(
      "",
      `Compared with ${report.comparison.label}: spending ${money(report.comparison.spending.previousPaise)}, income ${money(report.comparison.income.previousPaise)}.`,
    );
  }
  lines.push("", "Tracked from entries in PocketPulse, not verified by a bank.");
  return lines.join("\n");
}
