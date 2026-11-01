import { notFound } from "next/navigation";

import { getGoal } from "@/lib/data/queries";

/**
 * Resolves the goal before anything streams, like a transaction's detail page: this segment sits
 * outside the `(main)` loading boundary, so a missing id, or another user's, gets a real 404.
 */
export default async function GoalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await getGoal(id))) notFound();
  return children;
}
