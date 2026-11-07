import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

import {
  type ParentReport,
  formatBasisPoints,
  hiddenRowLabel,
  moneyFormatter,
  ratioBasisPoints,
  REPORT_DEFINITIONS,
  REPORT_TYPE_LABELS,
  reportSubcategories,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";

import {
  ACCENT,
  BAR,
  CONTENT,
  drawable,
  FONT_DIR,
  MARGIN,
  MUTED,
  Sheet,
  WIDTH,
} from "./pdf-layout";
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function summaryRows(report: ParentReport, money: (paise: number) => string) {
  const opening = report.openingAsOf
    ? `Opening balance · ${formatLocalDate(report.openingAsOf)}`
    : "Opening balances";
  const rows: [string, string, boolean?][] = [[opening, money(report.openingPaise)]];
  if (report.newlyTrackedPaise !== 0) {
    rows.push(["Wallets added during the period", money(report.newlyTrackedPaise)]);
  }
  rows.push(
    [`Income · ${count(report.incomeCount, "entry", "entries")}`, money(report.incomePaise)],
    [
      `Expenses · ${count(report.expenseCount, "purchase", "purchases")}`,
      report.expensesPaise > 0 ? `−${money(report.expensesPaise)}` : money(0),
    ],
    [`Refunds · ${count(report.refundCount, "entry", "entries")}`, money(report.refundsPaise)],
    ["Net movement", money(report.netMovementPaise), true],
  );
  if (report.beforeTrackingPaise !== 0) {
    rows.push([
      "Entries already in opening balances (no change to the balance)",
      money(-report.beforeTrackingPaise),
    ]);
  }
  rows.push([
    `${report.provisional ? "Balance so far" : "Closing balance"} · ${formatLocalDate(report.closingAsOf)}`,
    money(report.closingPaise),
    true,
  ]);
  return rows;
}

/** A real A4 PDF, built only from the report model, with the font embedded so ₹ always prints. */
export async function reportPdf(report: ParentReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`PocketPulse report: ${report.periodLabel}`);
  doc.setProducer("PocketPulse");
  doc.setCreator("PocketPulse");
  const [regular, bold] = await Promise.all([
    readFile(join(FONT_DIR, "Geist-Regular.ttf")).then((bytes) => doc.embedFont(bytes)),
    readFile(join(FONT_DIR, "Geist-SemiBold.ttf")).then((bytes) => doc.embedFont(bytes)),
  ]);

  const money = moneyFormatter(report.currency);
  let tableHeader: (() => void) | null = null;
  const sheet = new Sheet(doc, regular, bold, () => tableHeader?.());

  sheet.text("PocketPulse", MARGIN, sheet.y - 4, { size: 11, font: bold, color: ACCENT });
  sheet.right(`Generated ${formatLocalDate(report.generatedOn)}`, WIDTH - MARGIN, sheet.y - 4, {
    size: 8.5,
    color: MUTED,
  });
  sheet.y -= 34;
  sheet.text("Expense report", MARGIN, sheet.y, { size: 20, font: bold });
  sheet.y -= 18;
  sheet.text(`${report.periodLabel} · ${report.currency}`, MARGIN, sheet.y, {
    size: 10.5,
    color: MUTED,
  });
  if (report.provisional) {
    sheet.y -= 14;
    sheet.text("This period is still running, so its figures are so far.", MARGIN, sheet.y, {
      size: 9,
      color: MUTED,
    });
  }

  sheet.heading("Summary");
  for (const [label, value, strong] of summaryRows(report, money)) {
    sheet.ensure(18);
    const font = strong ? bold : regular;
    sheet.text(label, MARGIN, sheet.y, { font });
    sheet.right(value, WIDTH - MARGIN, sheet.y, { font });
    sheet.y -= 16;
  }
  if (report.setAsidePaise > 0 || report.releasedPaise > 0 || report.transferredPaise > 0) {
    sheet.ensure(16);
    sheet.text(
      `Not spending: ${money(report.setAsidePaise)} set aside for goals, ${money(report.releasedPaise)} released, ${money(report.transferredPaise)} moved between wallets.`,
      MARGIN,
      sheet.y,
      { size: 8.5, color: MUTED },
    );
    sheet.y -= 14;
  }

  if (report.comparison) {
    const { label, spending, income, sparse } = report.comparison;
    sheet.heading("Compared with the earlier period");
    const line = sparse
      ? `Spending ${money(spending.currentPaise)} against ${money(spending.previousPaise)} for ${label}. Too few purchases to read much into this.`
      : `Spending ${money(spending.currentPaise)} against ${money(spending.previousPaise)} for ${label}. Income ${money(income.currentPaise)} against ${money(income.previousPaise)}.`;
    for (const text of sheet.wrap(line, CONTENT, 9.5)) {
      sheet.ensure(14);
      sheet.text(text, MARGIN, sheet.y);
      sheet.y -= 13;
    }
  }

  sheet.heading("Spending by category");
  if (report.categories.length === 0 && !report.hiddenRow) {
    sheet.text("Nothing was spent in this period.", MARGIN, sheet.y, { color: MUTED });
    sheet.y -= 16;
  }
  const largest = Math.max(1, ...report.categories.map((c) => Math.max(0, c.netPaise)));
  for (const row of report.categories) {
    const subcategories = reportSubcategories(row);
    sheet.ensure(32 + subcategories.length * 13);
    sheet.text(row.label, MARGIN, sheet.y, { font: bold });
    sheet.right(money(row.netPaise), WIDTH - MARGIN, sheet.y, { font: bold });
    sheet.right(
      row.shareBp === null ? "" : formatBasisPoints(row.shareBp, 0),
      WIDTH - MARGIN - 86,
      sheet.y,
      {
        color: MUTED,
      },
    );
    sheet.right(`${row.count} ×`, WIDTH - MARGIN - 130, sheet.y, { color: MUTED });
    sheet.y -= 8;
    const bp = ratioBasisPoints(Math.max(0, row.netPaise), largest) ?? 0;
    sheet.page.drawRectangle({
      x: MARGIN,
      y: sheet.y - 1,
      width: Math.max(1, (CONTENT * bp) / 10_000),
      height: 3.5,
      color: BAR,
    });
    sheet.y -= 13;
    for (const sub of subcategories) {
      sheet.text(sub.label, MARGIN + 12, sheet.y, { size: 8.5, color: MUTED });
      sheet.right(money(sub.netPaise), WIDTH - MARGIN, sheet.y, { size: 8.5, color: MUTED });
      sheet.right(`${sub.count} ×`, WIDTH - MARGIN - 130, sheet.y, { size: 8.5, color: MUTED });
      sheet.y -= 13;
    }
    sheet.y -= 4;
  }
  if (report.hiddenRow) {
    sheet.ensure(18);
    sheet.text(hiddenRowLabel(), MARGIN, sheet.y, { font: bold });
    sheet.right(money(report.hiddenRow.netPaise), WIDTH - MARGIN, sheet.y, { font: bold });
    sheet.right(`${report.hiddenRow.count} ×`, WIDTH - MARGIN - 130, sheet.y, { color: MUTED });
    sheet.y -= 16;
  }

  if (report.transactions) {
    sheet.heading("Entries");
    const columns = {
      date: MARGIN,
      what: MARGIN + 62,
      category: MARGIN + 214,
      wallet: MARGIN + 340,
    };
    tableHeader = () => {
      for (const [label, x] of [
        ["Date", columns.date],
        ["Entry", columns.what],
        ["Category", columns.category],
        ["Wallet", columns.wallet],
      ] as const) {
        sheet.text(label, x, sheet.y, { size: 8, color: MUTED });
      }
      sheet.right("Amount", WIDTH - MARGIN, sheet.y, { size: 8, color: MUTED });
      sheet.y -= 13;
    };
    tableHeader();
    for (const row of report.transactions) {
      const note = row.note ? sheet.wrap(drawable(regular, row.note), CONTENT - 62, 8) : [];
      sheet.ensure(14 + note.length * 11);
      sheet.text(formatLocalDate(row.date), columns.date, sheet.y, { size: 8.5 });
      sheet.text(
        sheet.fit(drawable(regular, row.description || REPORT_TYPE_LABELS[row.type]), 146),
        columns.what,
        sheet.y,
        { size: 8.5 },
      );
      sheet.text(sheet.fit(drawable(regular, row.category), 122), columns.category, sheet.y, {
        size: 8.5,
        color: MUTED,
      });
      sheet.text(sheet.fit(drawable(regular, row.wallet), 86), columns.wallet, sheet.y, {
        size: 8.5,
        color: MUTED,
      });
      const signed = row.signedPaise < 0 ? `−${money(row.amountPaise)}` : money(row.amountPaise);
      sheet.right(signed, WIDTH - MARGIN, sheet.y, { size: 8.5 });
      sheet.y -= 13;
      for (const text of note) {
        sheet.text(text, columns.what, sheet.y, { size: 8, color: MUTED });
        sheet.y -= 11;
      }
    }
    tableHeader = null;
  }

  sheet.heading("What these figures mean");
  for (const [term, meaning] of REPORT_DEFINITIONS) {
    sheet.ensure(14);
    sheet.text(term, MARGIN, sheet.y, { size: 8.5, font: bold });
    sheet.text(meaning, MARGIN + 92, sheet.y, { size: 8.5, color: MUTED });
    sheet.y -= 13;
  }

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText("From entries recorded in PocketPulse. Not verified by a bank.", {
      x: MARGIN,
      y: 26,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
    const label = `Page ${index + 1} of ${pages.length}`;
    page.drawText(label, {
      x: WIDTH - MARGIN - regular.widthOfTextAtSize(label, 7.5),
      y: 26,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });
  return doc.save();
}
