import { Skeleton } from "@/components/ui/skeleton";

/** Survival mode while it loads: the status, the daily amount, then the tips. */
export default function SurvivalLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Survival mode…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <Skeleton className="h-52 rounded-2xl lg:col-span-3" />
        <Skeleton className="h-52 rounded-2xl lg:col-span-2" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
