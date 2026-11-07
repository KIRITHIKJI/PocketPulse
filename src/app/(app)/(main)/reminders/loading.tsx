import { Skeleton } from "@/components/ui/skeleton";

/** Reminders while they load: the open-app note, the notification list, then the switches. */
export default function RemindersLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Loading Reminders…</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <div className="flex flex-col gap-3 lg:col-span-7">
          <Skeleton className="h-80 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-5 lg:gap-6">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
