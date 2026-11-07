import Link from "next/link";
import { ArrowRight, Gauge } from "lucide-react";

import { SafeToSpendLink } from "@/components/home/plan-snapshots";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";

/**
 * Safe to Spend on Home: the suggested daily amount, always labelled an estimate and drawn in the
 * estimate colour. It streams in after the money figures (like the player status), so Home's own
 * figures never wait for the plan's reads. Without an income date it asks for one instead of
 * guessing. If its reads fail, it falls back to the plain link.
 */
export async function SafeToSpendCard() {
  let plan;
  try {
    plan = await loadPlan();
  } catch {
    return <SafeToSpendLink />;
  }
  const { result, money } = plan;
  const daily = result.status === "ok" ? result.suggestedDailyPaise : null;
  const until = result.inputs.horizonEndDate ?? result.inputs.nextIncomeDate;

  return (
    <Surface variant="interactive" asChild>
      <Link href="/safe-to-spend" data-testid="safe-to-spend-card">
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-feedback-info/15 text-money-estimate">
            <Gauge className="size-4" aria-hidden="true" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-caption text-muted-foreground">Safe to Spend · estimate</span>
            {daily !== null && until ? (
              <span className="type-body">
                About{" "}
                <span
                  className="font-semibold text-money-estimate money"
                  data-testid="home-safe-daily"
                  data-paise={daily}
                >
                  {money(daily)}
                </span>{" "}
                a day until {formatLocalDate(until)}
              </span>
            ) : (
              <span className="type-body">Add your next income date to get a daily amount</span>
            )}
          </span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        {daily !== null && (
          <span className="type-caption text-muted-foreground">
            From what you’ve recorded, after goals and bills. Not a limit to use up.
          </span>
        )}
      </Link>
    </Surface>
  );
}

export function SafeToSpendCardSkeleton() {
  return (
    <Surface aria-busy="true" data-testid="safe-to-spend-loading">
      <span className="sr-only">Loading the Safe to Spend estimate…</span>
      <div className="flex items-center gap-3" aria-hidden="true">
        <Skeleton className="size-9 rounded-lg" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
    </Surface>
  );
}
