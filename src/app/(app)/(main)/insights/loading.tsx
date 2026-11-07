import { Skeleton } from "@/components/ui/skeleton";

/** Insights' shape while it loads: header and periods, total beside categories, trend, findings. */
export default function InsightsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Insights…</span>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-12 w-full max-w-xl rounded-xl" />
      </div>
      <Skeleton className="h-12 w-full max-w-md rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-7" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Skeleton className="h-40 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    </div>
  );
}
