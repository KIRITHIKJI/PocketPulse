import * as React from "react";

import { cn } from "@/lib/utils";

/** Text input. 16px text on phones prevents iOS zoom-on-focus; 44px tall for touch. */
function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-background/40 px-3 text-base transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/25 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
