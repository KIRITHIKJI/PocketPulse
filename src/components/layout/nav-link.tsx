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
        "group relative flex min-h-10 items-center gap-3 rounded-lg px-3 type-body font-medium text-sidebar-foreground/80 transition-colors duration-(--duration-quick) outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-coarse:min-h-11",
        active &&
          "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary",
          active && "text-primary",
        )}
      />
      {item.label}
    </Link>
  );
}
