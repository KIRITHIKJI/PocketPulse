import { Skeleton } from "@/components/ui/skeleton";

/** An entry's shape while it loads: back link and title, the amount, then its details. */
export default function EntryLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading entry…</span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-7 w-48" />
      </div>
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-span-7 lg:gap-6">
          <Skeleton className="h-36 rounded-2xl" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
        <Skeleton className="h-80 rounded-2xl lg:col-span-5" />
      </div>
    </div>
  );
}
