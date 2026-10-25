"use client";

import * as React from "react";
import { RadioGroup } from "radix-ui";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  "aria-label": string;
  className?: string;
};

/** Accessible single-choice control (radio group semantics, arrow-key navigation). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ...props
}: SegmentedControlProps<T>) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={props["aria-label"]}
      orientation="horizontal"
      className={cn("inline-flex flex-wrap gap-1 rounded-xl border bg-muted/60 p-1", className)}
    >
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <RadioGroup.Item
          key={optionValue}
          value={optionValue}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:shadow-sm"
        >
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
          {label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
