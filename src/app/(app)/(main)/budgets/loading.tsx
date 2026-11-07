import { Skeleton } from "@/components/ui/skeleton";

/** Budgets while they load: the total budget, then the category grid. */
export default function BudgetsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Budgets…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      <Skeleton className="h-52 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
