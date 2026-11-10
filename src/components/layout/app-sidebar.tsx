"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ALL_NAV_ITEMS, findActiveItem, visibleGroups, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * A compact sidebar link: 32 px with a mouse, 44 px on touch. Long labels wrap, never clip.
 * Every link is on screen now, so prefetching them all on load would render ~20 routes on the
 * server for every page; instead a link prefetches when it is pointed at or focused.
 */
function SidebarItem({
  item,
  active,
  boxed,
  wide,
}: {
  item: NavItem;
  active: boolean;
  /** Record's entry buttons keep a border, so they read as actions rather than places. */
  boxed?: boolean;
  /** Spans both columns (Home, which has no group of its own). */
  wide?: boolean;
}) {
  const Icon = item.icon;
  // Next.js's hover-prefetch pattern: no prefetch until the link is wanted, then the usual one.
  const [wanted, setWanted] = React.useState(false);
  const want = () => setWanted(true);
  return (
    <Link
      href={item.href}
      prefetch={wanted ? null : false}
      onMouseEnter={want}
      onFocus={want}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex min-h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 type-caption font-medium text-sidebar-foreground/80 transition-colors duration-(--duration-quick) outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11",
        boxed && "border border-sidebar-border hover:border-border-strong",
        wide && "col-span-2",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
        active &&
          !boxed &&
          "before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
        active && boxed && "border-primary/30",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary",
          active && "text-primary",
        )}
      />
      <span className="min-w-0">{item.label}</span>
    </Link>
  );
}

/**
 * Desktop navigation (doc/DESIGN_PLAN.md §5): logo, the compact player chip, the one Add button,
 * then the groups as two-column grids, so the whole list fits a 768 px tall screen without
 * scrolling. Home leads without a group label. With progress features off there is no chip and
 * no Progress group.
 */
export function AppSidebar({
  showProgress = true,
  playerChip,
}: {
  showProgress?: boolean;
  /** The streamed compact player chip; only rendered when progress features are on. */
  playerChip?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = findActiveItem(pathname, ALL_NAV_ITEMS);

  return (
    <aside
      aria-label="Main navigation"
      className="sticky top-0 hidden h-dvh w-68 shrink-0 flex-col gap-2 border-r border-sidebar-border bg-sidebar/80 px-3 pt-3 pb-3 backdrop-blur-xl lg:flex"
    >
      <Link
        href="/home"
        className="self-start rounded-lg px-2 py-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label="PocketPulse home"
      >
        <Logo />
      </Link>
      {showProgress && playerChip}
      <Button asChild className="w-full">
        <Link href="/add">
          <Plus aria-hidden="true" />
          Add expense
        </Link>
      </Button>
      <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-1 pt-0.5">
        {visibleGroups(showProgress).map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!group.lead && (
              <p className="px-2 type-caption font-medium text-text-tertiary">{group.label}</p>
            )}
            <div className={cn("grid grid-cols-2 gap-0.5", group.grid && "gap-1")}>
              {group.items.map((item) => (
                <SidebarItem
                  key={item.href}
                  item={item}
                  active={active?.href === item.href}
                  boxed={group.grid}
                  wide={group.lead}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
