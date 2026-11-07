import { Info } from "lucide-react";

import { BUDGET_TARGET_NOTE } from "@/domain";
import { cn } from "@/lib/utils";

const METER_TONES = {
  primary: "bg-progress-money",
  positive: "bg-progress-money",
  warning: "bg-feedback-warning",
} as const;

/** A plain bar beside figures that already say the same thing in text. Prefer `Progress`. */
export function Meter({ bp, tone }: { bp: number; tone: keyof typeof METER_TONES }) {
  const width = `${Math.min(100, Math.max(0, bp / 100))}%`;
  return (
    <div
      className="h-(--progress-height) overflow-hidden rounded-full bg-progress-track"
      aria-hidden="true"
    >
      <div
        className={`h-full rounded-full ${METER_TONES[tone]} transition-[width] duration-(--duration-emphasis) ease-(--ease-out)`}
        style={{ width }}
      />
    </div>
  );
}

/** A goal's progress. The stroke eases to its value; CSS drops that under reduced motion. */
export function ProgressRing({
  bp,
  size = 72,
  tone = "money",
  children,
}: {
  bp: number;
  size?: number;
  /** `earmark`: money set aside for a goal (silver), so it never reads as spent or received. */
  tone?: "money" | "earmark";
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
          className="stroke-progress-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${length}`}
          className={cn(
            "transition-[stroke-dasharray] duration-(--duration-emphasis) ease-(--ease-out)",
            tone === "earmark" ? "stroke-money-earmark" : "stroke-progress-money",
          )}
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
    <p className={cn("type-body", className)} data-testid="budget-remaining">
      <span className="font-medium money">
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
    <p className="flex gap-2 rounded-xl bg-surface-inset p-3 type-caption text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-feedback-info" aria-hidden="true" />
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
  valueClassName,
}: {
  /** e.g. `text-money-earmark` for money set aside. */
  valueClassName?: string;
  label: string;
  value: string;
  explanation?: React.ReactNode;
  testId?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
      <dt
        className={cn(
          "min-w-0 flex-1 type-body",
          strong ? "font-semibold" : "text-muted-foreground",
        )}
      >
        {label}
      </dt>
      <dd
        className={cn("shrink-0 type-body money", strong && "type-heading", valueClassName)}
        data-testid={testId}
      >
        {value}
      </dd>
      {explanation && (
        <dd className="basis-full type-caption text-pretty text-muted-foreground">{explanation}</dd>
      )}
    </div>
  );
}
