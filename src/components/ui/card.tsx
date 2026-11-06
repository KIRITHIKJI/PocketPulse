import * as React from "react";

import { surfaceVariants } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** The default Surface. Screens not yet redesigned keep their 16 px gap until their phase. */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(surfaceVariants({ variant: "card" }), "gap-4", className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1", className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("type-heading", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("type-body text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription };
