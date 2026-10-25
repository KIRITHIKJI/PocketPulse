import { notFound } from "next/navigation";

/**
 * Transaction detail. No ledger is connected yet, so every id is genuinely unknown and
 * resolves to the not-found state rather than a mock record.
 */
export default function TransactionDetailPage() {
  notFound();
}
