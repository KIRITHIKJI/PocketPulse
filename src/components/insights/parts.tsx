"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { ChevronRight, Info } from "lucide-react";

import type { ChartPoint } from "@/components/insights/trend-chart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { CurrencyCode, TrendGranularity } from "@/domain";
import { INSIGHT_PERIODS, TREND_LABELS } from "@/lib/insights-view";
import { cn } from "@/lib/utils";

// Recharts only runs in the browser and is heavy, so it loads with this card, not the whole app.
const TrendChart = dynamic(() => import("@/components/insights/trend-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});

export function PeriodPicker({
  kind,
  customFrom,
  customTo,
  error,
  extra = "",
}: {
  kind: string;
  customFrom: string;
  customTo: string;
  error: string | null;
  /** Other query values to keep, starting with "&". */
  extra?: string;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Period" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-1 rounded-xl border bg-muted/50 p-1">
          {INSIGHT_PERIODS.map((p) => (
            <li key={p.value}>
              <Link
                href={`${pathname}?period=${p.value}${extra}` as Route}
                scroll={false}
                aria-current={kind === p.value ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  kind === p.value && "bg-card text-foreground shadow-sm",
                )}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {kind === "custom" && (
        <form method="get" action={pathname} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value="custom" />
          <label className="flex flex-col gap-1 text-sm font-medium">
            From
            <Input type="date" name="from" defaultValue={customFrom} required className="w-44" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            To
            <Input type="date" name="to" defaultValue={customTo} required className="w-44" />
          </label>
          <Button type="submit" variant="outline">
            Show period
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-warning">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TrendRow extends ChartPoint {
  key: string;
}

export function TrendCard({
  title,
  granularity,
  optionHrefs,
  rows,
  currency,
  summary,
  sparseReason,
  note,
}: {
  title: string;
  granularity: TrendGranularity | null;
  /** One link per granularity on offer: plain data, because this is a client component. */
  optionHrefs: readonly { granularity: TrendGranularity; href: Route }[];
  rows: TrendRow[];
  currency: CurrencyCode;
  summary: string;
  sparseReason: string | null;
  note: string | null;
}) {
  return (
    <Card className="min-w-0 gap-3" data-testid="trend-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {optionHrefs.length > 1 && !sparseReason && (
          <ul className="flex gap-1" aria-label="Trend detail">
            {optionHrefs.map(({ granularity: g, href }) => (
              <li key={g}>
                <Link
                  href={href}
                  scroll={false}
                  aria-current={g === granularity ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-lg px-2.5 text-sm text-muted-foreground hover:text-foreground",
                    g === granularity && "bg-muted font-medium text-foreground",
                  )}
                >
                  {TREND_LABELS[g]}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {sparseReason ? (
        <p className="text-sm text-muted-foreground" data-testid="trend-sparse">
          {sparseReason}
        </p>
      ) : (
        <>
          <TrendChart points={rows} currency={currency} summary={summary} />
          {note && <NoteLine>{note}</NoteLine>}
          <details className="text-sm">
            <summary className="flex min-h-10 cursor-pointer items-center font-medium text-muted-foreground hover:text-foreground">
              See as a table
            </summary>
            <table className="w-full">
              <caption className="sr-only">{summary}</caption>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 font-medium">
                    When
                  </th>
                  <th scope="col" className="py-1 font-medium">
                    Purchases
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Net spending
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t">
                    <td className="py-1.5">
                      {row.href ? (
                        <Link href={row.href} className="text-primary underline">
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    <td className="tabular py-1.5">{row.detail}</td>
                    <td className="tabular py-1.5 text-right">{row.amountLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Card>
  );
}

export function NoteLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** A label and figure that opens the entries behind it. */
export function FigureLink({
  href,
  label,
  value,
  hint,
  testId,
}: {
  href: Route | null;
  label: string;
  value: React.ReactNode;
  hint?: string;
  testId?: string;
}) {
  const body = (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="tabular text-xl font-semibold" data-testid={testId}>
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const box = "flex flex-col gap-0.5 rounded-2xl border bg-card p-4";
  return href ? (
    <Link
      href={href}
      className={cn(
        box,
        "transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** A plain row that opens something, with a chevron. */
export function RowLink({
  href,
  children,
  testId,
}: {
  href: Route;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** Horizontal share bar. Width is the share of what's drawn; the transition honours motion CSS. */
export function ShareBar({ bp, color }: { bp: number | null; color: string | null }) {
  return (
    <span className="block h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <span
        className="block h-full rounded-full bg-chart-1 transition-[width] duration-500"
        style={{
          width: `${Math.min(100, (bp ?? 0) / 100)}%`,
          ...(color ? { backgroundColor: color } : {}),
        }}
      />
    </span>
  );
}
