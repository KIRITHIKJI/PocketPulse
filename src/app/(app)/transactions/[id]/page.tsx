import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Info, Pencil, RotateCcw } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteEntryButton, RepeatEntryButton } from "@/components/transactions/entry-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type TransactionSource,
  formatMoney,
  indexById,
  isActive,
  isBeforeOpeningDate,
  occurredAtMs,
  refundableAmount,
  refundedAmount,
} from "@/domain";
import {
  getAccounts,
  getCategories,
  getLedger,
  getLedgerRecord,
  getProfile,
} from "@/lib/data/queries";
import { TYPE_LABELS, entryView } from "@/lib/entry-view";
import { formatDateTime, formatLocalDate } from "@/lib/format";
import { isEntryType } from "@/lib/ledger/commands";
import { beforeOpeningText } from "@/lib/opening-note";

export const metadata: Metadata = { title: "Entry" };

const SOURCE_LABELS: Record<TransactionSource, string> = {
  manual: "Full form",
  quick_add: "Quick add",
  parsed_text: "Typed text",
  voice: "Voice",
  recurring: "Recurring template",
  import: "Import",
};

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [record, profile, accounts, categories, ledger] = await Promise.all([
    getLedgerRecord(id),
    getProfile(),
    getAccounts(),
    getCategories(),
    getLedger(),
  ]);
  if (!record) notFound();
  const tz = profile.timeZone;
  const money = (paise: number) => formatMoney(paise, { currency: profile.currency });
  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const ledgerById = indexById(ledger);
  const view = entryView(record, {
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    accountsById,
    ledgerById,
    currency: profile.currency,
  });
  const when = formatDateTime(record.occurredAt, tz);

  const touched =
    record.type === "transfer"
      ? [record.fromAccountId, record.toAccountId]
      : "accountId" in record
        ? [record.accountId]
        : [];
  const beforeOpening = touched
    .map((accountId) => accountsById.get(accountId))
    .filter((a) => a && isBeforeOpeningDate(a, occurredAtMs(record), tz));

  const refunds =
    record.type === "expense"
      ? ledger.filter((tx) => tx.type === "refund" && tx.refundOfId === record.id && isActive(tx))
      : [];
  const original = record.type === "refund" ? ledgerById.get(record.refundOfId) : undefined;
  const canRefund = record.type === "expense" && refundableAmount(record.id, ledger) > 0;

  const rows: [string, React.ReactNode][] = [
    ["Type", TYPE_LABELS[record.type]],
    ["When", when],
    ...(view.categoryLabel ? [["Category", view.categoryLabel] as [string, string]] : []),
    ...(view.walletLabel ? [["Wallet", view.walletLabel] as [string, string]] : []),
    ...(record.merchant ? [["Merchant", record.merchant] as [string, string]] : []),
    ...(record.description ? [["Description", record.description] as [string, string]] : []),
    ...(record.note ? [["Note", record.note] as [string, string]] : []),
    ...(record.tags.length
      ? [
          [
            "Tags",
            <span key="tags" className="flex flex-wrap justify-end gap-1">
              {record.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </span>,
          ] as [string, React.ReactNode],
        ]
      : []),
    ["Recorded with", SOURCE_LABELS[record.source]],
    ["Recorded", formatDateTime(record.createdAt, tz)],
    ...(record.updatedAt !== record.createdAt
      ? [["Last changed", formatDateTime(record.updatedAt, tz)] as [string, string]]
      : []),
  ];

  const repeatable = record.type === "expense" || record.type === "income";
  // Savings moves (allocations/releases) are managed from the goal they belong to.
  const editable = isEntryType(record.type);

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-3">
          <Link href="/transactions">
            <ArrowLeft aria-hidden="true" />
            History
          </Link>
        </Button>
      </div>
      <PageHeader title={view.title} />

      <Card className="gap-5">
        <div className="flex items-center gap-4">
          <CategoryBadge icon={view.categoryIcon} color={view.categoryColor} />
          <div className="min-w-0">
            <p
              className={`tabular text-3xl font-semibold tracking-tight ${view.tone === "in" ? "text-positive" : ""}`}
              data-testid="entry-amount"
            >
              {view.amountLabel}
            </p>
            <p className="text-sm text-muted-foreground">{when}</p>
          </div>
        </div>

        {beforeOpening.map((a) => (
          <p key={a!.id} className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs" role="note">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            {beforeOpeningText(a!.name, formatLocalDate(a!.openingBalanceDate), true)}
          </p>
        ))}

        <dl className="divide-y text-sm">
          {rows.map(([term, value]) => (
            <div key={term} className="flex items-start justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-muted-foreground">{term}</dt>
              <dd className="min-w-0 text-right break-words">{value}</dd>
            </div>
          ))}
        </dl>

        {record.type === "expense" && refunds.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl bg-positive-soft p-3 text-sm">
            <p className="font-medium">
              {money(refundedAmount(record.id, ledger))} of {money(record.amountPaise)} refunded
            </p>
            <ul className="flex flex-col gap-1">
              {refunds.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/transactions/${r.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {money(r.amountPaise)} on {formatDateTime(r.occurredAt, tz)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {original && (
          <p className="text-sm">
            Refund of{" "}
            <Link
              href={`/transactions/${original.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {original.description || original.merchant || "the original expense"} (
              {money(original.amountPaise)})
            </Link>
            . It adds money back and reduces spending; it isn’t counted as income.
          </p>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {editable && (
            <Button asChild>
              <Link href={`/transactions/${record.id}/edit`}>
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            </Button>
          )}
          {repeatable && "accountId" in record && (
            <RepeatEntryButton
              label={`${view.title}, ${money(record.amountPaise)}`}
              template={{
                type: record.type,
                amountPaise: record.amountPaise,
                currency: record.currency,
                accountId: accountsById.get(record.accountId)?.archivedAt
                  ? (accounts.find((a) => a.isDefault)?.id ?? record.accountId)
                  : record.accountId,
                fromAccountId: null,
                toAccountId: null,
                refundOfId: null,
                categoryId: record.categoryId,
                subcategoryId: record.subcategoryId,
                description: record.description,
                merchant: record.merchant,
                note: null,
                tags: record.tags,
              }}
            />
          )}
          {canRefund && (
            <Button variant="outline" asChild>
              <Link href={`/transactions/new?type=refund&refundOf=${record.id}`}>
                <RotateCcw aria-hidden="true" />
                Record a refund
              </Link>
            </Button>
          )}
          <DeleteEntryButton
            id={record.id}
            summary={`${view.amountLabel} · ${view.title} · ${when}`}
            blockedReason={
              refunds.length > 0
                ? "This expense has refunds linked to it. Delete the refunds first, so your totals never show a refund without its purchase."
                : null
            }
          />
        </div>
      </Card>
    </>
  );
}
