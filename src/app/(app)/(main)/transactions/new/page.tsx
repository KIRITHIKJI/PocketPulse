import type { Metadata } from "next";
import { randomUUID } from "node:crypto";

import { PageHeader } from "@/components/layout/page-header";
import { SectionTabs } from "@/components/layout/section-tabs";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Surface } from "@/components/ui/surface";
import { indexById, toLocalTime } from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { getSpendingLedger } from "@/lib/data/queries";
import { requestNow } from "@/lib/data/session";
import { refundOptions } from "@/lib/entry-view";
import { formatDateTime } from "@/lib/format";
import { isEntryType } from "@/lib/ledger/commands";

export const metadata: Metadata = { title: "Full form" };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Refund choices: purchases and the refunds already against them.
  const [kit, ledger] = await Promise.all([loadEntryKit(), getSpendingLedger()]);
  const ctx = {
    categoriesById: new Map(kit.categories.map((c) => [c.id, c])),
    accountsById: new Map(kit.accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    currency: kit.currency,
  };
  const refundable = refundOptions(ledger, ctx, (iso) => formatDateTime(iso, kit.timeZone));
  const requestedType = typeof params.type === "string" ? params.type : "";
  const refundOf = typeof params.refundOf === "string" ? params.refundOf : "";

  return (
    <>
      <PageHeader
        title="Full form"
        description="Only amount and category are needed; the date, time and wallet are filled in."
      />
      <SectionTabs section="record" />
      <Surface className="w-full max-w-3xl">
        <TransactionForm
          kit={kit}
          mode="create"
          opId={randomUUID()}
          refundable={refundable}
          initial={{
            id: randomUUID(),
            version: null,
            type: isEntryType(requestedType) ? requestedType : "expense",
            amountPaise: null,
            categoryId: null,
            subcategoryId: null,
            accountId: kit.defaultAccountId,
            fromAccountId: kit.defaultAccountId,
            toAccountId: null,
            refundOfId: refundable.some((r) => r.id === refundOf) ? refundOf : null,
            date: kit.today,
            time: toLocalTime(requestNow(), kit.timeZone),
            description: "",
            merchant: "",
            note: "",
            tags: "",
          }}
        />
      </Surface>
    </>
  );
}
