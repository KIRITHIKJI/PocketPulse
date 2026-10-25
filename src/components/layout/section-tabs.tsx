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
 * Horizontal sibling navigation (e.g. Budgets · Goals · Safe to spend · Survival).
 * Takes a section key rather than items so server pages don't pass icon components across
 * the client boundary.
 */
export function SectionTabs({ section }: { section: keyof typeof SECTION_TABS }) {
  const pathname = usePathname();
  const items = SECTION_TABS[section];
  const active = findActiveItem(pathname, items);

  return (
    <nav aria-label={LABELS[section]} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1 rounded-xl border bg-muted/50 p-1">
        {items.map((item) => {
          const isActive = active?.href === item.href;
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
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
