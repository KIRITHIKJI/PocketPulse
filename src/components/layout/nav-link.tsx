import Link from "next/link";

import type { NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SidebarNavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-[1.1rem] text-muted-foreground transition-colors group-hover:text-primary",
          active && "text-primary",
        )}
      />
      {item.label}
    </Link>
  );
}
