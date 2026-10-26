import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { PiggyBank } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { StatePanel } from "@/components/states/state-panel";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { indexById, occurredAtMs, toLocalDate, toLocalTime } from "@/domain";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { getLedger, getLedgerRecord } from "@/lib/data/queries";
import { entryView, refundOptions } from "@/lib/entry-view";
import { formatDateTime } from "@/lib/format";
import { isEntryType } from "@/lib/ledger/commands";

export const metadata: Metadata = { title: "Edit entry" };

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, kit, ledger] = await Promise.all([
    getLedgerRecord(id),
    loadEntryKit(),
    getLedger(),
  ]);
  if (!record) notFound();

  if (!isEntryType(record.type)) {
    return (
      <>
        <PageHeader title="Edit entry" />
        <StatePanel
          icon={PiggyBank}
          title="Savings moves are managed from their goal"
          description="Money set aside for a goal (or released from it) isn’t spending or income, so it’s changed from the goal itself rather than this form."
          actions={
            <Button asChild>
              <Link href="/goals">Open savings goals</Link>
            </Button>
          }
        />
      </>
    );
  }

  const ctx = {
    categoriesById: new Map(kit.categories.map((c) => [c.id, c])),
    accountsById: new Map(kit.accounts.map((a) => [a.id, a])),
    ledgerById: indexById(ledger),
    currency: kit.currency,
  };
  const at = occurredAtMs(record);
  const refundable =
    record.type === "refund"
      ? (() => {
          const original = ctx.ledgerById.get(record.refundOfId);
          return original
            ? [
                {
                  id: original.id,
                  label: `${entryView(original, ctx).title} · ${formatDateTime(original.occurredAt, kit.timeZone)}`,
                },
              ]
            : [];
        })()
      : [];

  return (
    <>
      <PageHeader
        title="Edit entry"
        description="Balances, history and category totals update as soon as you save."
      />
      <Card>
        <TransactionForm
          kit={kit}
          mode="edit"
          opId={randomUUID()}
          refundable={
            refundable.length
              ? refundable
              : refundOptions(ledger, ctx, (iso) => formatDateTime(iso, kit.timeZone))
          }
          initial={{
            id: record.id,
            version: record.version,
            type: record.type,
            amountPaise: record.amountPaise,
            categoryId: "categoryId" in record ? record.categoryId : null,
            subcategoryId: "subcategoryId" in record ? record.subcategoryId : null,
            accountId: "accountId" in record ? record.accountId : null,
            fromAccountId: record.type === "transfer" ? record.fromAccountId : null,
            toAccountId: record.type === "transfer" ? record.toAccountId : null,
            refundOfId: record.type === "refund" ? record.refundOfId : null,
            date: toLocalDate(at, kit.timeZone),
            time: toLocalTime(at, kit.timeZone),
            description: record.description ?? "",
            merchant: record.merchant ?? "",
            note: record.note ?? "",
            tags: record.tags.join(", "),
          }}
        />
      </Card>
    </>
  );
}
