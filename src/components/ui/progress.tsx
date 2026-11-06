import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  money: "bg-progress-money",
  xp: "bg-(image:--gradient-xp)",
  warning: "bg-feedback-warning",
  over: "bg-money-negative",
  neutral: "bg-text-secondary",
} as const;

export type ProgressTone = keyof typeof TONES;

type ProgressProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Progress in basis points (10 000 = 100 %), as the domain returns it. Ignored with `steps`. */
  bp?: number;
  /** A count out of a whole (4 of 7 days): draws separated segments. */
  steps?: number;
  value?: number;
  tone?: ProgressTone;
  /** Shown above the bar, left. Also names the bar for screen readers. */
  label?: React.ReactNode;
  /** Shown above the bar, right (tabular). Defaults to the percentage or "value of steps". */
  valueText?: string;
  /** The value isn't known yet. */
  indeterminate?: boolean;
  disabled?: boolean;
};

/**
 * A linear progress bar (doc/DESIGN_PLAN.md §3). Values over 100 % draw full with an over-limit
 * marker and keep the real value in the text. The fill eases over 280 ms; reduced motion drops it.
 */
export function Progress({
  bp = 0,
  steps,
  value = 0,
  tone = "money",
  label,
  valueText,
  indeterminate = false,
  disabled = false,
  className,
  "aria-label": ariaLabel,
  ...props
}: ProgressProps) {
  const labelId = React.useId();
  const segmented = steps !== undefined && steps > 0;
  const ratioBp = segmented ? Math.round((Math.max(0, value) / steps) * 10_000) : Math.max(0, bp);
  const over = ratioBp > 10_000;
  const complete = ratioBp >= 10_000 && !over;
  const shownPct = Math.min(100, ratioBp / 100);
  const text =
    valueText ??
    (indeterminate
      ? "Loading"
      : segmented
        ? `${Math.max(0, value)} of ${steps}`
        : `${Math.round(ratioBp / 100)}%`);

  return (
    <div
      data-slot="progress"
      data-state={
        indeterminate
          ? "loading"
          : over
            ? "over"
            : complete
              ? "complete"
              : ratioBp === 0
                ? "empty"
                : "partial"
      }
      className={cn("flex flex-col gap-1.5", disabled && "opacity-60", className)}
      {...props}
    >
      {label ? (
        <div className="flex items-baseline justify-between gap-3 type-caption">
          <span id={labelId} className="min-w-0 text-text-secondary">
            {label}
          </span>
          <span className="flex items-center gap-1 font-medium money text-foreground">
            {complete ? (
              <Check className="size-3.5 text-feedback-success" aria-hidden="true" />
            ) : null}
            {text}
          </span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        aria-valuemin={0}
        aria-valuemax={segmented ? steps : 100}
        aria-valuenow={
          indeterminate ? undefined : segmented ? Math.max(0, value) : Math.round(ratioBp / 100)
        }
        aria-valuetext={indeterminate ? "Loading" : text}
        className={cn(
          "relative h-(--progress-height) w-full overflow-hidden rounded-full bg-progress-track",
          segmented && "flex gap-0.5 bg-transparent",
        )}
      >
        {indeterminate ? (
          <span
            className={cn(
              "pp-progress-sweep absolute inset-y-0 left-0 w-2/5 rounded-full",
              TONES[tone],
            )}
          />
        ) : segmented ? (
          Array.from({ length: steps }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-full flex-1 bg-progress-track transition-colors duration-(--duration-standard) first:rounded-l-full last:rounded-r-full",
                index < value && (disabled ? TONES.neutral : TONES[tone]),
              )}
            />
          ))
        ) : (
          <span
            className={cn(
              "block h-full rounded-full transition-[width] duration-(--duration-emphasis) ease-(--ease-out)",
              disabled ? TONES.neutral : TONES[over ? "over" : tone],
            )}
            style={{ width: `${shownPct}%` }}
          />
        )}
        {over && !indeterminate ? (
          <span className="absolute inset-y-0 right-0 w-1 bg-foreground/70" aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
