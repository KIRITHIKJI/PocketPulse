import { Skeleton } from "@/components/ui/skeleton";

/** Sync's shape while it loads: one readable column of surfaces, so nothing jumps. */
export default function SyncSettingsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex w-full max-w-2xl flex-col gap-6">
      <span className="sr-only">Loading Sync…</span>
      <Skeleton className="h-9 w-28 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}
