import { Skeleton } from "@/components/ui/skeleton";

/** The full form's shape while it loads: header, tabs, then the form surface. */
export default function NewEntryLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading the full form…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-10 w-72 max-w-full" />
      <Skeleton className="h-112 w-full max-w-3xl rounded-2xl" />
    </div>
  );
}
