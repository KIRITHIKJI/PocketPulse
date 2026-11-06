import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * The one card style (doc/DESIGN_PLAN.md §3). `Card` is this component with the default variant.
 * Never put a card inside a card: use `inset` for a group inside one.
 */
const surfaceVariants = cva("relative flex flex-col gap-stack text-card-foreground", {
  variants: {
    variant: {
      card: "rounded-2xl border border-(--surface-card-border) bg-(--surface-card-bg) p-surface shadow-(--surface-card-shadow)",
      hero: "overflow-hidden rounded-2xl border border-(--surface-card-border) bg-(--surface-hero-bg) p-surface shadow-(--surface-raised-shadow) before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-(image:--gradient-status-edge)",
      inset: "rounded-xl bg-surface-inset p-3",
      interactive:
        "rounded-2xl border border-(--surface-card-border) bg-(--surface-card-bg) p-surface shadow-(--surface-card-shadow) outline-none transition-[background-color,border-color,transform] duration-(--duration-quick) hover:border-border-strong hover:bg-surface-2 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99] active:duration-(--duration-instant) aria-disabled:pointer-events-none aria-disabled:opacity-60",
      status:
        "overflow-hidden rounded-2xl border border-primary/25 bg-(--surface-hero-bg) p-surface shadow-(--surface-raised-shadow) before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-(image:--gradient-status-edge)",
    },
  },
  defaultVariants: { variant: "card" },
});

type SurfaceProps = React.ComponentProps<"div"> &
  VariantProps<typeof surfaceVariants> & {
    /** Render as the child element (a link or button) instead of a div; use with `interactive`. */
    asChild?: boolean;
    /** Keeps the box and replaces its content with skeleton lines while data loads. */
    loading?: boolean;
  };

function Surface({
  className,
  variant,
  asChild = false,
  loading,
  children,
  ...props
}: SurfaceProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="surface"
      data-variant={variant ?? "card"}
      aria-busy={loading || undefined}
      className={cn(surfaceVariants({ variant }), className)}
      {...props}
    >
      {loading && !asChild ? <SurfaceSkeleton /> : children}
    </Comp>
  );
}

function SurfaceSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <span className="h-4 w-1/3 animate-pulse rounded-sm bg-muted" />
      <span className="h-7 w-1/2 animate-pulse rounded-sm bg-muted" />
      <span className="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}

function SurfaceHeader({
  className,
  title,
  meta,
  action,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title?: React.ReactNode;
  meta?: React.ReactNode;
  /** One trailing action (a link or ghost button). */
  action?: React.ReactNode;
}) {
  return (
    <div
      data-slot="surface-header"
      className={cn("flex items-start justify-between gap-3", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {title ? <h2 className="type-heading">{title}</h2> : null}
        {meta ? <p className="type-caption text-text-secondary">{meta}</p> : null}
        {children}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export { Surface, SurfaceHeader, surfaceVariants };
