import { Skeleton } from "@/components/ui/skeleton";

/** Savings goals while they load: the set-aside total, then the goal grid. */
export default function GoalsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Savings goals…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      <Skeleton className="h-20 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
