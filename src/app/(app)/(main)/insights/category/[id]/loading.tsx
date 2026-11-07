import { Skeleton } from "@/components/ui/skeleton";

/** A category's shape while it loads: back link, header, total beside the trend, then entries. */
export default function CategoryInsightsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading category insights…</span>
      <Skeleton className="h-9 w-28 rounded-lg" />
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-80 rounded-2xl lg:col-span-7" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
