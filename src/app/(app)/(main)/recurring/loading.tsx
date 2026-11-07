import { Skeleton } from "@/components/ui/skeleton";

/** Income & recurring while it loads: the header, then the timeline beside the item list. */
export default function RecurringLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Income & recurring…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-13 rounded-xl lg:hidden" />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-3 lg:col-span-7">
          <Skeleton className="h-96 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
