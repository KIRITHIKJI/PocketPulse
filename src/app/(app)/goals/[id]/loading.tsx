import { Skeleton } from "@/components/ui/skeleton";

/** A goal while it loads: the back link and title, the saved figure, then its history. */
export default function GoalLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading the goal…</span>
      <Skeleton className="h-9 w-32 rounded-xl" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-9 w-64 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <Skeleton className="h-96 rounded-2xl lg:col-span-3" />
        <div className="flex flex-col gap-2 lg:col-span-2">
          <Skeleton className="h-6 w-24" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
