import type { Metadata } from "next";
import { Repeat } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";

export const metadata: Metadata = { title: "Income & recurring" };

export default function RecurringPage() {
  return (
    <>
      <PageHeader
        title="Income & recurring"
        description="Allowance, salary and repeating bills. Templates are forecasts until you confirm they happened."
      />
      <StatePanel
        icon={Repeat}
        title="No recurring items"
        description="Add your pocket money or a monthly recharge here to see it in safe-to-spend and reminders."
      />
    </>
  );
}
