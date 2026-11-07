import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, PiggyBank, RotateCcw } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { Notice } from "@/components/feedback/notice";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteEntryButton, RepeatEntryButton } from "@/components/transactions/entry-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  type TransactionSource,
  indexById,
  isActive,
  isBeforeOpeningDate,
  moneyFormatter,
  occurredAtMs,
  purchaseRelease,
  refundableAmount,
  refundedAmount,
} from "@/domain";
import {
  getAccounts,
  getCategories,
  getGoalLedger,
  getGoals,
  getLedgerRecord,
  getProfile,
  getSpendingLedger,
} from "@/lib/data/queries";
import { mergeLedger } from "@/lib/data/slices";
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
  // What this page links an entry to: its refunds or purchase, and a goal release.
  const [record, profile, accounts, categories, spending, goalLedger, goals] = await Promise.all([
    getLedgerRecord(id),
    getProfile(),
    getAccounts(),
    getCategories(),
    getSpendingLedger(),
    getGoalLedger(),
    getGoals(),
  ]);
  const ledger = mergeLedger(spending, goalLedger);
  if (!record) notFound();
  const tz = profile.timeZone;
  const money = moneyFormatter(profile.currency);
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

  const release = record.type === "expense" ? purchaseRelease(record, ledger) : null;
  const releasedFrom = release ? goals.find((g) => g.id === release.goalId) : undefined;

  const repeatable = record.type === "expense" || record.type === "income";
  // Savings moves (allocations/releases) are managed from the goal they belong to.
  const editable = isEntryType(record.type);

  // Goal moves aren't spending: money set aside stays yours, a release goes back to flexible.
  const goalTitle =
    "goalId" in record ? (goals.find((g) => g.id === record.goalId)?.title ?? "a goal") : null;
  const goalMove =
    record.type === "allocation"
      ? `Set aside for ${goalTitle}. Still yours, not spent.`
      : record.type === "allocation_release"
        ? `Released from ${goalTitle} back to your flexible money. Not income.`
        : null;
  const amountTone =
    view.tone === "in"
      ? "text-money-positive"
      : goalMove
        ? "text-money-earmark"
        : "text-foreground";

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

      {/* Phones: amount, facts, actions. Desktop: amount and actions left, facts right. */}
      <div className="grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_1fr] lg:items-start lg:gap-6">
        <Surface variant="hero" className="min-w-0 lg:col-span-7">
          <div className="flex items-center gap-4">
            <CategoryBadge icon={view.categoryIcon} color={view.categoryColor} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="type-caption text-muted-foreground">{TYPE_LABELS[record.type]}</p>
              <p className={`type-display money ${amountTone}`} data-testid="entry-amount">
                {view.amountLabel}
              </p>
              <p className="type-caption text-muted-foreground">{when}</p>
            </div>
          </div>
          {goalMove && <p className="type-body text-text-secondary">{goalMove}</p>}

          {beforeOpening.map((a) => (
            <Notice key={a!.id} tone="warning">
              {beforeOpeningText(a!.name, formatLocalDate(a!.openingBalanceDate), true)}
            </Notice>
          ))}

          {record.type === "expense" && refunds.length > 0 && (
            <Surface variant="inset" className="gap-2 type-body">
              <p className="font-medium">
                <span className="text-money-positive money">
                  {money(refundedAmount(record.id, ledger))}
                </span>{" "}
                of <span className="money">{money(record.amountPaise)}</span> refunded
              </p>
              <ul className="flex flex-col">
                {refunds.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/transactions/${r.id}`}
                      className="inline-flex items-center text-primary underline-offset-4 hover:underline pointer-coarse:min-h-11"
                    >
                      <span className="money">{money(r.amountPaise)}</span>&nbsp;on{" "}
                      {formatDateTime(r.occurredAt, tz)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Surface>
          )}
          {original && (
            <p className="type-body text-text-secondary">
              Refund of{" "}
              <Link
                href={`/transactions/${original.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {original.description || original.merchant || "the original expense"} (
                <span className="money">{money(original.amountPaise)}</span>)
              </Link>
              . It adds money back and reduces spending; it isn’t counted as income.
            </p>
          )}
        </Surface>

        <Surface className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <SurfaceHeader title="Details" />
          <dl className="-my-1 divide-y type-body">
            {rows.map(([term, value]) => (
              <div key={term} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="shrink-0 text-muted-foreground">{term}</dt>
                <dd className="min-w-0 text-right break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </Surface>

        <div className="flex flex-wrap gap-2 lg:col-span-7 lg:col-start-1">
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
                presetId: record.type === "expense" ? record.presetId : null,
              }}
            />
          )}
          {"goalId" in record && (
            <Button variant="outline" asChild>
              <Link href={`/goals/${record.goalId}`}>
                <PiggyBank aria-hidden="true" />
                Open the goal
              </Link>
            </Button>
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
            version={record.version}
            summary={`${view.amountLabel} · ${view.title} · ${when}`}
            blockedReason={
              refunds.length > 0
                ? "This expense has refunds linked to it. Delete the refunds first, so your totals never show a refund without its purchase."
                : null
            }
            {...(release && {
              note: `This was bought with money saved for ${releasedFrom?.title ?? "a goal"}. The ${money(release.amountPaise)} released stays out of the goal. You’ll get the option to set it aside again.`,
            })}
          />
        </div>
      </div>
    </>
  );
}
