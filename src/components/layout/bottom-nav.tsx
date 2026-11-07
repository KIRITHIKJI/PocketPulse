"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Plus, type LucideIcon } from "lucide-react";

import { SidebarNavLink } from "@/components/layout/nav-link";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  ALL_NAV_ITEMS,
  MOBILE_TABS,
  YOU_ITEMS,
  findActiveItem,
  visibleGroups,
  visibleItems,
} from "@/lib/navigation";
import { cn } from "@/lib/utils";

const TAB =
  "flex h-full w-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium text-muted-foreground outline-none transition-colors focus-visible:text-foreground";

function TabMark({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
        active && "bg-primary-soft",
      )}
    >
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}

/**
 * Phones: Home · Activity · Add · Insights · Plan · You. Add is docked in the bar, so nothing
 * floats over the page. You opens a sheet with progress, Reports, Reminders, Settings and every
 * other section.
 */
export function BottomNav({ showProgress = true }: { showProgress?: boolean }) {
  const pathname = usePathname();
  const [youOpen, setYouOpen] = React.useState(false);
  const active = findActiveItem(pathname, MOBILE_TABS);
  const youActive = findActiveItem(pathname, YOU_ITEMS) !== undefined;
  const onAdd = pathname === "/add" || pathname.startsWith("/add/");
  const [first, second, ...rest] = MOBILE_TABS;

  const tab = (item: (typeof MOBILE_TABS)[number]) => {
    const isActive = active?.href === item.href;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={isActive ? "page" : undefined}
          className={cn(TAB, isActive && "text-primary")}
        >
          <TabMark icon={item.icon} active={isActive} />
          {item.label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-6">
        {tab(first!)}
        {tab(second!)}
        <li className="flex items-center justify-center">
          <Link
            href="/add"
            aria-label="Add expense"
            aria-current={onAdd ? "page" : undefined}
            className="flex size-12 items-center justify-center rounded-2xl bg-(--button-primary-bg) text-(--button-primary-text) shadow-(--surface-raised-shadow) transition-transform duration-(--duration-instant) outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 aria-[current=page]:ring-2 aria-[current=page]:ring-primary/40"
          >
            <Plus className="size-6" aria-hidden="true" />
          </Link>
        </li>
        {rest.map(tab)}
        <li>
          <button
            type="button"
            onClick={() => setYouOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={youOpen}
            className={cn(TAB, youActive && "text-primary")}
          >
            <TabMark icon={CircleUserRound} active={youActive} />
            You
          </button>
        </li>
      </ul>
      <YouSheet
        open={youOpen}
        onOpenChange={setYouOpen}
        pathname={pathname}
        showProgress={showProgress}
      />
    </nav>
  );
}

function YouSheet({
  open,
  onOpenChange,
  pathname,
  showProgress,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
  showProgress: boolean;
}) {
  const active = findActiveItem(pathname, ALL_NAV_ITEMS);
  const youActive = findActiveItem(pathname, YOU_ITEMS);
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <div className="flex flex-col gap-1 pr-10">
          <SheetTitle>You</SheetTitle>
          <SheetDescription>
            Your progress, reports and settings, and every section.
          </SheetDescription>
        </div>
        <nav aria-label="You" className="flex flex-col gap-0.5">
          {visibleItems(YOU_ITEMS, showProgress).map((item) => (
            <SidebarNavLink
              key={item.href}
              item={item}
              active={youActive?.href === item.href}
              onNavigate={close}
            />
          ))}
        </nav>
        <nav
          aria-label="All sections"
          className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2"
        >
          {visibleGroups(showProgress).map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 type-caption font-semibold text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  active={active?.href === item.href}
                  onNavigate={close}
                />
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
