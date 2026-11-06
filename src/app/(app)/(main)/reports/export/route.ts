import { NextResponse, type NextRequest } from "next/server";

import { reportCsv } from "@/domain";
import { requireSession } from "@/lib/data/session";
import { loadReport } from "@/lib/reports/load";
import { reportPdf } from "@/lib/reports/pdf";

/**
 * The report as a download, built only when the user asks and returned only to them. All data
 * comes through the signed-in, RLS-scoped loaders; nothing is stored or sent anywhere else.
 */
export async function GET(request: NextRequest) {
  await requireSession();
  const params = Object.fromEntries(
    [...new Set(request.nextUrl.searchParams.keys())].map((key) => [
      key,
      request.nextUrl.searchParams.getAll(key),
    ]),
  );
  const { report } = await loadReport(params);
  const name = `pocketpulse-report-${report.period.startDate ?? "all-time"}`;
  const headers = { "Cache-Control": "private, no-store" };

  if (request.nextUrl.searchParams.get("format") === "csv") {
    return new NextResponse(reportCsv(report), {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    });
  }
  return new NextResponse(Buffer.from(await reportPdf(report)), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
    },
  });
}
