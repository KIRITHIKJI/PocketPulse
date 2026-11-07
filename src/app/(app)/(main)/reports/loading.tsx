import { Skeleton } from "@/components/ui/skeleton";

/** The parent report while it loads: options on the left, exports and the paper preview beside. */
export default function ReportsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Parent report…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,45rem)] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-112 rounded-2xl" />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:order-first">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
