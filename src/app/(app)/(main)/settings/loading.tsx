import { Skeleton } from "@/components/ui/skeleton";

/** Settings' shape while it loads: the section list, then the first section surfaces. */
export default function SettingsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Settings…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <Skeleton className="h-28 rounded-2xl lg:col-span-3 lg:h-96" />
        <div className="flex flex-col gap-6 lg:col-span-9">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
