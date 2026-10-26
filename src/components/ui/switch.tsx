"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * On/off switch (role="switch"). With `name` it submits like a checkbox ("on" when checked), so
 * it works inside plain server-action forms.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-[1.375rem]" />
    </SwitchPrimitive.Root>
  );
}

/** A switch with its label and an optional description, the whole row clickable. */
function SwitchRow({
  id,
  label,
  description,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  id: string;
  label: string;
  description?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description && (
          <p id={`${id}-description`} className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <Switch
        id={id}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5"
        {...props}
      />
    </div>
  );
}

export { Switch, SwitchRow };
