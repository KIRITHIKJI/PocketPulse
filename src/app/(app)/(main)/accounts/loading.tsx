import { Skeleton } from "@/components/ui/skeleton";

/** Wallets' shape while it loads: header, the total, then the wallet grid (rows on phones). */
export default function WalletsLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Wallets…</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-xl lg:h-40 lg:rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
