"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { SidebarNavLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ALL_NAV_ITEMS, NAV_GROUPS, findActiveItem } from "@/lib/navigation";

/** Mobile access to every screen that isn't one of the five bottom tabs. */
export function MobileMoreSheet() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const active = findActiveItem(pathname, ALL_NAV_ITEMS);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open all sections">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <div className="flex flex-col gap-1 pr-10">
          <SheetTitle>All sections</SheetTitle>
          <SheetDescription>Jump anywhere in PocketPulse.</SheetDescription>
        </div>
        <nav aria-label="All sections" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </p>
              {group.items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  item={item}
                  active={active?.href === item.href}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
