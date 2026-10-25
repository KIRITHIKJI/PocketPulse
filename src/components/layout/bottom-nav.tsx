"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { MOBILE_TABS, findActiveItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();
  const active = findActiveItem(pathname, MOBILE_TABS);
  const onAddScreen = pathname === "/add" || pathname.startsWith("/add/");

  return (
    <>
      {onAddScreen ? null : (
        <Link
          href="/add"
          aria-label="Add expense"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_32px_-8px_var(--primary)] transition-transform active:scale-95 lg:hidden"
        >
          <Plus className="size-6" aria-hidden="true" />
        </Link>
      )}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {MOBILE_TABS.map((item) => {
            const isActive = active?.href === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-muted-foreground transition-colors",
                    isActive && "text-primary",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-primary-soft",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
