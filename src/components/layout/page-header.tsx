import * as React from "react";

import { cn } from "@/lib/utils";

/** The one page title per view (`type-title`), a one-line description, and the page's actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="type-title text-balance">{title}</h1>
        {description ? (
          <p className="max-w-2xl type-body text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
