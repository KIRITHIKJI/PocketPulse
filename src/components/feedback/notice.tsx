"use client";

import * as React from "react";
import {
  CircleAlert,
  CircleCheck,
  Info,
  TriangleAlert,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TONES = {
  info: { icon: Info, color: "text-feedback-info", soft: "bg-feedback-info/10" },
  success: { icon: CircleCheck, color: "text-feedback-success", soft: "bg-feedback-success/10" },
  warning: { icon: TriangleAlert, color: "text-feedback-warning", soft: "bg-feedback-warning/10" },
  error: { icon: CircleAlert, color: "text-feedback-error", soft: "bg-feedback-error/10" },
  offline: { icon: WifiOff, color: "text-feedback-offline", soft: "bg-feedback-offline/10" },
} as const satisfies Record<string, { icon: LucideIcon; color: string; soft: string }>;

export type NoticeTone = keyof typeof TONES;

/**
 * A persistent in-page message: a budget alert, being offline, a note about the data
 * (doc/DESIGN_PLAN.md §3). Errors are announced as alerts; everything else politely.
 */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  onDismiss,
  icon,
  className,
}: {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children: React.ReactNode;
  /** One link or ghost button that does something about it. */
  action?: React.ReactNode;
  /** Shows a close button when given. */
  onDismiss?: () => void;
  icon?: LucideIcon;
  className?: string;
}) {
  const config = TONES[tone];
  const Icon = icon ?? config.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-slot="notice"
      data-tone={tone}
      className={cn("flex items-start gap-3 rounded-xl p-3 type-body", config.soft, className)}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", config.color)} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-muted-foreground">{children}</div>
        {action ? <div className="mt-1.5 -ml-3">{action}</div> : null}
      </div>
      {onDismiss ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="-mt-1.5 -mr-1.5 text-muted-foreground"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
