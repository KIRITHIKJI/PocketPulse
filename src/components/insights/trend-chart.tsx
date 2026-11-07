"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useReducedMotion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useMotionPreference } from "@/components/providers/motion-provider";
import { type CurrencyCode, formatMoney } from "@/domain";

export interface ChartPoint {
  label: string;
  chartPaise: number;
  /** The exact amount, which for a refund-heavy bucket differs from the bar. */
  amountLabel: string;
  detail: string;
  href: Route | null;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: readonly { payload?: ChartPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 type-body text-popover-foreground shadow-md">
      <p className="font-medium">{point.label}</p>
      <p className="money">{point.amountLabel}</p>
      <p className="type-caption text-muted-foreground">{point.detail}</p>
    </div>
  );
}

/**
 * One series: spending over time, in the one accent colour; axes and grid stay grey and the peak
 * carries its amount as a direct label. Clicking a bar opens the entries behind it.
 */
export default function TrendChart({
  points,
  currency,
  summary,
}: {
  points: ChartPoint[];
  currency: CurrencyCode;
  summary: string;
}) {
  const router = useRouter();
  const { preference } = useMotionPreference();
  const systemReduced = useReducedMotion();
  const animate = preference === "full" || (preference === "system" && !systemReduced);
  const peakIndex = points.reduce(
    (best, point, index) => (point.chartPaise > (points[best]?.chartPaise ?? 0) ? index : best),
    -1,
  );

  return (
    <div role="img" aria-label={summary} className="h-56 w-full" data-testid="trend-chart">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 224 }}
      >
        <BarChart data={points} margin={{ top: 22, right: 0, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--progress-track)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            width={64}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            allowDecimals={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value: number) =>
              formatMoney(Math.round(value), { currency, paise: "never" })
            }
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--accent)", opacity: 0.5 }}
            isAnimationActive={false}
          />
          <Bar
            dataKey="chartPaise"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
            isAnimationActive={animate}
            animationDuration={280}
            cursor="pointer"
            onClick={(bar) => {
              const href = (bar.payload as ChartPoint | undefined)?.href;
              if (href) router.push(href);
            }}
          >
            <LabelList
              position="top"
              offset={6}
              fill="var(--muted-foreground)"
              fontSize={12}
              className="money"
              valueAccessor={(_entry: unknown, index: number) =>
                index === peakIndex ? points[index]!.amountLabel : ""
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
