"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { type CurrencyCode, formatMoney } from "@/domain";
import type { OpStatus, QueuedOp } from "@/lib/offline/ops";

const STATUS: Record<OpStatus, { label: string; icon: LucideIcon; className: string }> = {
  pending: { label: "Waiting to sync", icon: Clock, className: "text-warning" },
  syncing: { label: "Syncing", icon: LoaderCircle, className: "text-primary" },
  synced: { label: "Synced", icon: CheckCircle2, className: "text-positive" },
  failed: { label: "Failed", icon: CircleAlert, className: "text-destructive" },
  conflict: { label: "Needs a decision", icon: AlertTriangle, className: "text-warning" },
};

export function opAmount(op: QueuedOp, fallback: CurrencyCode): string | null {
  if (op.amountPaise === null) return null;
  return formatMoney(op.amountPaise, {
    currency: (op.currency as CurrencyCode | null) ?? fallback,
  });
}

export function StatusBadge({ status }: { status: OpStatus }) {
  const { label, icon: Icon, className } = STATUS[status];
  return (
    <Badge variant="outline" className="gap-1" data-testid="sync-status" data-status={status}>
      <Icon
        className={`size-3 ${className} ${status === "syncing" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {label}
    </Badge>
  );
}
