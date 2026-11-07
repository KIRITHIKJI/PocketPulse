"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SidebarNavLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import { ALL_NAV_ITEMS, findActiveItem, visibleGroups } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Desktop navigation (doc/DESIGN_PLAN.md §5): logo, the compact player chip, the one Add button,
 * then the groups. Record is a 2 × 2 grid. With progress features off there is no chip and no
 * Progress group.
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
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-3 border-r border-sidebar-border bg-sidebar/80 px-3 pt-4 pb-3 backdrop-blur-xl lg:flex"
    >
      <Link
        href="/home"
        className="self-start rounded-lg px-2 py-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
      <nav className="-mx-1 flex flex-1 flex-col gap-3 overflow-y-auto px-1 pt-1 pb-2">
        {visibleGroups(showProgress).map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-0.5 type-caption font-medium text-text-tertiary">{group.label}</p>
            {group.grid ? (
              <div className="grid grid-cols-2 gap-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = active?.href === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex min-h-10 items-center gap-2 rounded-lg border border-sidebar-border px-2.5 type-caption font-medium text-sidebar-foreground/80 transition-colors duration-(--duration-quick) outline-none hover:border-border-strong hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11",
                        isActive &&
                          "border-primary/30 bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground",
                          isActive && "text-primary",
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              group.items.map((item) => (
                <SidebarNavLink key={item.href} item={item} active={active?.href === item.href} />
              ))
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
