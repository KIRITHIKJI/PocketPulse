import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Five variants (doc/DESIGN_PLAN.md §3): one `default` (primary) per region, `outline` for
 * secondary, `ghost` for toolbars, `positive` for confirming money in or a completion,
 * `destructive` only for irreversible actions. On touch screens every size is at least 44 px.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-(--duration-quick) outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.98] active:duration-(--duration-instant) disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-(--button-primary-bg) text-(--button-primary-text) hover:bg-(--button-primary-bg-hover)",
        outline:
          "border border-input bg-transparent hover:border-border-strong hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        positive: "bg-positive text-positive-foreground hover:bg-positive/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40",
      },
      size: {
        default: "h-10 px-4 pointer-coarse:h-11",
        sm: "h-9 rounded-md px-3 pointer-coarse:h-11",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "size-10 pointer-coarse:size-11",
        "icon-sm": "size-9 pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner in place of the leading icon, keeps the label (no width jump), and blocks clicks. */
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading && !asChild ? <LoadingLabel>{children}</LoadingLabel> : children}
    </Comp>
  );
}

/** Replaces the first icon child with a spinner so the button keeps its size while busy. */
function LoadingLabel({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const first = items[0];
  const firstIsIcon = React.isValidElement(first) && typeof first.type !== "string";
  return (
    <>
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      {firstIsIcon ? items.slice(1) : items}
    </>
  );
}

export { Button };
