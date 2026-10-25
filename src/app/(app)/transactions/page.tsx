import type { Metadata } from "next";
import { Receipt } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every recorded expense, income, refund, transfer and savings allocation — searchable and editable."
      />
      <StatePanel
        icon={Receipt}
        title="No transactions yet"
        description="Your history will appear here, newest first, with search and filters."
      />
    </>
  );
}
