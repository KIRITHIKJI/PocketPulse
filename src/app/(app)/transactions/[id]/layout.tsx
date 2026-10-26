import { notFound } from "next/navigation";

import { getLedgerRecord } from "@/lib/data/queries";

/**
 * Resolves the entry before anything streams. This segment sits outside the `(main)` loading
 * boundary, so a missing id — or another user's, which RLS makes invisible — gets a real 404
 * status with the in-app not-found screen, not a streamed 200.
 */
export default async function TransactionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getLedgerRecord(id))) notFound();
  return children;
}
