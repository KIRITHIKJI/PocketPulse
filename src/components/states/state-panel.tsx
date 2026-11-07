import * as React from "react";
import { CircleAlert, Lock, Sparkles, WifiOff, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  empty: { icon: Sparkles, tone: "bg-primary-soft text-primary", role: undefined },
  error: {
    icon: CircleAlert,
    tone: "bg-feedback-error/15 text-feedback-error",
    role: "alert",
  },
  offline: {
    icon: WifiOff,
    tone: "bg-feedback-offline/15 text-feedback-offline",
    role: "status",
  },
  denied: { icon: Lock, tone: "bg-muted text-muted-foreground", role: "alert" },
} as const satisfies Record<string, { icon: LucideIcon; tone: string; role?: string }>;

type StateVariant = keyof typeof VARIANTS;

type StatePanelProps = {
  variant?: StateVariant;
  /** `page`: the whole view is empty (centred). `section`: one part of a view, inside its card. */
  size?: "page" | "section";
  title: string;
  /** What will appear here, and how to make it appear. One or two short lines. */
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Buttons or links, inside the panel; each must perform a real action. */
  actions?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
};

/**
 * The shared empty / error / offline / permission-denied presentation (doc/DESIGN_PLAN.md §3).
 * A new user's empty state says what will appear here and offers the action that makes it appear.
 */
export function StatePanel({
  variant = "empty",
  size = "page",
  title,
  description,
  icon,
  actions,
  className,
  "data-testid": testId,
}: StatePanelProps) {
  const config = VARIANTS[variant];
  const Icon = icon ?? config.icon;
  const page = size === "page";
  return (
    <section
      role={config.role}
      data-testid={testId}
      data-state={variant}
      data-size={size}
      className={cn(
        "flex gap-3",
        page
          ? "flex-col items-center rounded-2xl border bg-card/60 px-6 py-12 text-center"
          : "items-start text-left",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl",
          page ? "size-12" : "size-10",
          config.tone,
        )}
        aria-hidden="true"
      >
        <Icon className={page ? "size-6" : "size-5"} />
      </span>
      <div className={cn("flex min-w-0 flex-col gap-1", page && "items-center")}>
        <h2 className="type-heading">{title}</h2>
        {description ? (
          <div className={cn("type-body text-muted-foreground", page && "max-w-md text-balance")}>
            {description}
          </div>
        ) : null}
        {actions ? (
          <div className={cn("mt-2 flex flex-wrap gap-2", page && "justify-center")}>{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
