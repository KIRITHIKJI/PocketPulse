import { Skeleton } from "@/components/ui/skeleton";

/** Safe to spend while it loads: the daily estimate, the breakdown, then the form. */
export default function SafeToSpendLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Safe to spend…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}
