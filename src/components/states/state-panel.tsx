import * as React from "react";
import { CircleAlert, Lock, Sparkles, WifiOff, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const VARIANTS = {
  empty: { icon: Sparkles, tone: "bg-primary-soft text-primary", role: undefined },
  error: { icon: CircleAlert, tone: "bg-destructive/15 text-destructive", role: "alert" },
  offline: { icon: WifiOff, tone: "bg-warning/15 text-warning", role: "status" },
  denied: { icon: Lock, tone: "bg-muted text-muted-foreground", role: "alert" },
} as const satisfies Record<string, { icon: LucideIcon; tone: string; role?: string }>;

export type StateVariant = keyof typeof VARIANTS;

type StatePanelProps = {
  variant?: StateVariant;
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  /** Buttons or links; each must perform a real action. */
  actions?: React.ReactNode;
  className?: string;
};

/** Shared empty / error / offline / permission-denied presentation. */
export function StatePanel({
  variant = "empty",
  title,
  description,
  icon,
  actions,
  className,
}: StatePanelProps) {
  const config = VARIANTS[variant];
  const Icon = icon ?? config.icon;
  return (
    <section
      role={config.role}
      data-state={variant}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className={cn("flex size-12 items-center justify-center rounded-2xl", config.tone)}
        aria-hidden="true"
      >
        <Icon className="size-6" />
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <div className="max-w-md text-sm text-balance text-muted-foreground">{description}</div>
      ) : null}
      {actions ? <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </section>
  );
}
