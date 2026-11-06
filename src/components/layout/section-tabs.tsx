"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SECTION_TABS, findActiveItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const LABELS: Record<keyof typeof SECTION_TABS, string> = {
  record: "Ways to record",
  insights: "Insights sections",
  plan: "Planning tools",
};

/**
 * Sibling navigation (e.g. Budgets · Goals · Safe to spend · Survival). It always fits the width.
 * Takes a section key rather than items so server pages don't pass icon components across
 * the client boundary.
 */
export function SectionTabs({ section }: { section: keyof typeof SECTION_TABS }) {
  const pathname = usePathname();
  const items = SECTION_TABS[section];
  const active = findActiveItem(pathname, items);

  return (
    <nav aria-label={LABELS[section]}>
      {/* Phones: equal columns, icon over label, so nothing is cut off. Wider: one row. */}
      <ul className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border bg-muted/50 p-1 sm:flex sm:w-max">
        {items.map((item) => {
          const isActive = active?.href === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-center text-xs leading-tight font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm sm:whitespace-nowrap",
                  isActive && "bg-card text-foreground shadow-sm",
                )}
              >
                <Icon className={cn("size-4", isActive && "text-primary")} aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
