import { Skeleton } from "@/components/ui/skeleton";

/** Money leaks' shape while it loads: header, periods, grouping, then the list of groups. */
export default function MoneyLeaksLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Money leaks…</span>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full max-w-md rounded-xl" />
      <Skeleton className="h-12 w-full max-w-lg rounded-xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
