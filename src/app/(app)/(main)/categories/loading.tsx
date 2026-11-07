import { Skeleton } from "@/components/ui/skeleton";

/** Categories' shape while it loads: header, tabs, then the tree beside its note. */
export default function CategoriesLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Categories…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-12 w-96 max-w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
        <Skeleton className="h-36 rounded-2xl lg:col-span-4 lg:col-start-9 lg:row-start-1" />
        <div className="flex flex-col gap-2 lg:col-span-8 lg:col-start-1 lg:row-start-1">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
