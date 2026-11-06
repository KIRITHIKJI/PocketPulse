import { Skeleton } from "@/components/ui/skeleton";

/** Home's shape while it loads: balance, tiles, then the side cards, so nothing jumps. */
export default function HomeLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Home…</span>
      <Skeleton className="h-7 w-32" />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-4 lg:col-span-8 lg:gap-6">
          <Skeleton className="h-44 rounded-2xl" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-22 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 lg:col-span-4 lg:gap-6">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
