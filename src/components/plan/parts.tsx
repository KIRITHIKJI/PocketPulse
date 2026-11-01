import { Info } from "lucide-react";

import { BUDGET_TARGET_NOTE } from "@/domain";
import { cn } from "@/lib/utils";

const METER_TONES = { primary: "bg-primary", positive: "bg-positive", warning: "bg-warning" };

/** A plain bar. The exact figures always sit beside it as text. */
export function Meter({ bp, tone }: { bp: number; tone: keyof typeof METER_TONES }) {
  const width = `${Math.min(100, Math.max(0, bp / 100))}%`;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className={`h-full rounded-full ${METER_TONES[tone]} transition-[width] duration-500`}
        style={{ width }}
      />
    </div>
  );
}

/** A goal's progress. The stroke eases to its value; CSS drops that under reduced motion. */
export function ProgressRing({
  bp,
  size = 72,
  children,
}: {
  bp: number;
  size?: number;
  children?: React.ReactNode;
}) {
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const filled = (Math.min(10_000, Math.max(0, bp)) / 10_000) * length;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
          className="stroke-positive transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children}</span>
    </span>
  );
}

/**
 * The one way a remaining budget amount is shown, so its label can't be left out: "left" next to
 * a rupee figure reads like money in a pocket, and a budget isn't that.
 */
export function BudgetRemaining({
  remainingPaise,
  money,
  className,
}: {
  remainingPaise: number;
  money: (paise: number) => string;
  className?: string;
}) {
  return (
    <p className={cn("tabular text-sm", className)} data-testid="budget-remaining">
      <span className="font-medium">
        {remainingPaise >= 0
          ? `${money(remainingPaise)} left`
          : `${money(-remainingPaise)} over target`}
      </span>
      <span className="text-muted-foreground"> · {BUDGET_TARGET_NOTE}</span>
    </p>
  );
}

export function PlanNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** One line of a calculation: what it is, the number, and how that number was reached. */
export function FigureRow({
  label,
  value,
  explanation,
  testId,
  strong,
}: {
  label: string;
  value: string;
  explanation?: React.ReactNode;
  testId?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <dt className={cn("text-sm", strong ? "font-semibold" : "text-muted-foreground")}>
          {label}
        </dt>
        <dd
          className={cn("tabular shrink-0", strong && "text-lg font-semibold")}
          data-testid={testId}
        >
          {value}
        </dd>
      </div>
      {explanation && <p className="text-xs text-muted-foreground">{explanation}</p>}
    </div>
  );
}
