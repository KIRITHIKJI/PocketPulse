"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { SidebarNavLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import { ALL_NAV_ITEMS, NAV_GROUPS, findActiveItem } from "@/lib/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  const active = findActiveItem(pathname, ALL_NAV_ITEMS);

  return (
    <aside
      aria-label="Main navigation"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar/80 px-3 py-5 backdrop-blur-xl lg:flex"
    >
      <Link href="/home" className="rounded-xl px-3 py-1" aria-label="PocketPulse home">
        <Logo />
      </Link>
      <Button asChild size="lg" className="mx-1">
        <Link href="/add">
          <Plus aria-hidden="true" />
          Add expense
        </Link>
      </Button>
      <nav className="-mx-1 flex flex-1 flex-col gap-4 overflow-y-auto px-1 pb-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[0.7rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              {group.label}
            </p>
            {group.items.map((item) => (
              <SidebarNavLink key={item.href} item={item} active={active?.href === item.href} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
