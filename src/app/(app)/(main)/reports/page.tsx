import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Parent report" };

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Parent report"
        description="Pick a period, review the numbers, and choose exactly what to export. Nothing is ever sent automatically."
      />
      <StatePanel
        icon={FileText}
        title="No activity to report"
        description="Reports show opening and closing balances, income, spending, refunds and category totals for the period you choose, exportable as PDF, CSV or text."
      />
    </>
  );
}
