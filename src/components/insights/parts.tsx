"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import { CalendarRange, Check, ChevronDown, ChevronRight, Info } from "lucide-react";

import type { ChartPoint } from "@/components/insights/trend-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import type { CurrencyCode, TrendGranularity } from "@/domain";
import { INSIGHT_PERIODS, TREND_LABELS } from "@/lib/insights-view";
import { cn } from "@/lib/utils";

// Recharts only runs in the browser and is heavy, so it loads with this card, not the whole app.
const TrendChart = dynamic(() => import("@/components/insights/trend-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full rounded-xl" />,
});

const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
  const [open, setOpen] = React.useState(false);
  const current = INSIGHT_PERIODS.find((p) => p.value === kind);
  const href = (value: string) => `${pathname}?period=${value}${extra}` as Route;
  return (
    <div className="flex flex-col gap-3">
      {/* Wider screens: every period in one row. Phones: one button that opens them in a sheet,
          so nothing is cut off. */}
      <nav aria-label="Period" className="hidden sm:block">
        <ul className="flex w-max max-w-full flex-wrap gap-1 rounded-xl border bg-muted/50 p-1">
          {INSIGHT_PERIODS.map((p) => (
            <li key={p.value}>
              <Link
                href={href(p.value)}
                scroll={false}
                aria-current={kind === p.value ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-lg px-3 type-body font-medium whitespace-nowrap text-muted-foreground transition-colors duration-(--duration-quick) hover:text-foreground pointer-coarse:min-h-11",
                  FOCUS,
                  kind === p.value && "bg-card text-foreground shadow-sm",
                )}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            className="justify-between sm:hidden"
            data-testid="period-button"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarRange aria-hidden="true" />
              <span className="text-muted-foreground">Period</span>
              <span className="truncate">{current?.label ?? "Choose"}</span>
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent>
          <div className="flex flex-col gap-1 pr-10">
            <SheetTitle>Period</SheetTitle>
            <SheetDescription>
              Every figure on this screen follows the period you pick.
            </SheetDescription>
          </div>
          <nav aria-label="Choose a period">
            <ul className="flex flex-col gap-0.5">
              {INSIGHT_PERIODS.map((p) => (
                <li key={p.value}>
                  <Link
                    href={href(p.value)}
                    scroll={false}
                    onClick={() => setOpen(false)}
                    aria-current={kind === p.value ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 items-center justify-between rounded-lg px-3 type-body font-medium hover:bg-accent aria-[current=true]:bg-sidebar-accent",
                      FOCUS,
                    )}
                  >
                    {p.label}
                    {kind === p.value && (
                      <Check className="size-4 text-primary" aria-hidden="true" />
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
      {kind === "custom" && (
        <form method="get" action={pathname} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="period" value="custom" />
          <label className="flex flex-col gap-1.5 type-body font-medium">
            From
            <Input type="date" name="from" defaultValue={customFrom} required className="w-44" />
          </label>
          <label className="flex flex-col gap-1.5 type-body font-medium">
            To
            <Input type="date" name="to" defaultValue={customTo} required className="w-44" />
          </label>
          <Button type="submit" variant="outline">
            Show period
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="type-body text-feedback-warning">
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
  /** Says what the chart shows happened, not what kind of chart it is. */
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
    <Surface className="min-w-0" data-testid="trend-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 type-heading text-pretty">{title}</h2>
        {optionHrefs.length > 1 && !sparseReason && (
          <ul className="flex gap-1 rounded-lg bg-muted/50 p-0.5" aria-label="Trend detail">
            {optionHrefs.map(({ granularity: g, href }) => (
              <li key={g}>
                <Link
                  href={href}
                  scroll={false}
                  aria-current={g === granularity ? "true" : undefined}
                  className={cn(
                    "inline-flex min-h-9 items-center rounded-md px-2.5 type-body text-muted-foreground hover:text-foreground pointer-coarse:min-h-11",
                    FOCUS,
                    g === granularity && "bg-card font-medium text-foreground shadow-sm",
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
        <p className="type-body text-muted-foreground" data-testid="trend-sparse">
          {sparseReason}
        </p>
      ) : (
        <>
          <TrendChart points={rows} currency={currency} summary={summary} />
          {note && <NoteLine>{note}</NoteLine>}
          <details className="type-body">
            <summary
              className={cn(
                "flex min-h-10 cursor-pointer items-center rounded-lg font-medium text-muted-foreground hover:text-foreground pointer-coarse:min-h-11",
                FOCUS,
              )}
            >
              See as a table
            </summary>
            <table className="w-full">
              <caption className="sr-only">{summary}</caption>
              <thead className="text-left type-caption text-muted-foreground">
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
                        <Link
                          href={row.href}
                          className="rounded-sm text-primary underline underline-offset-2"
                        >
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    <td className="py-1.5 money">{row.detail}</td>
                    <td className="py-1.5 text-right money">{row.amountLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </Surface>
  );
}

export function NoteLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-1.5 type-caption text-pretty text-muted-foreground">
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
      <span className="type-caption text-muted-foreground">{label}</span>
      <span className="type-heading money" data-testid={testId}>
        {value}
      </span>
      {hint && <span className="type-caption text-muted-foreground">{hint}</span>}
    </>
  );
  return href ? (
    <Surface variant="interactive" asChild className="gap-0.5">
      <Link href={href}>{body}</Link>
    </Surface>
  ) : (
    <Surface className="gap-0.5">{body}</Surface>
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
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 transition-colors duration-(--duration-quick) hover:bg-accent",
        FOCUS,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

/** Horizontal share bar. Width is the share of what's drawn; the transition honours motion CSS. */
export function ShareBar({ bp, color }: { bp: number | null; color: string | null }) {
  return (
    <span
      className="block h-(--progress-height) overflow-hidden rounded-full bg-progress-track"
      aria-hidden="true"
    >
      <span
        className="block h-full rounded-full bg-chart-1 transition-[width] duration-(--duration-emphasis) ease-(--ease-out)"
        style={{
          width: `${Math.min(100, (bp ?? 0) / 100)}%`,
          ...(color ? { backgroundColor: color } : {}),
        }}
      />
    </span>
  );
}
