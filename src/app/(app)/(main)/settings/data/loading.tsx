import { Skeleton } from "@/components/ui/skeleton";

/** Your data's shape while it loads: one readable column of surfaces, so nothing jumps. */
export default function DataSettingsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-2xl flex-col gap-6">
      <span className="sr-only">Loading Your data…</span>
      <Skeleton className="h-9 w-28 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  );
}
