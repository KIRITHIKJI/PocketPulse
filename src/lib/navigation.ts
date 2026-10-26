import type { Route } from "next";
import {
  Bell,
  ChartPie,
  Droplets,
  FileText,
  Gauge,
  House,
  LifeBuoy,
  MessageSquareText,
  Mic,
  PiggyBank,
  Receipt,
  Repeat,
  Settings,
  SquarePen,
  Tags,
  Target,
  Trophy,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that should also mark this item active (e.g. a tab that covers several screens). */
  also?: readonly string[];
};

export type NavGroup = { label: string; items: readonly NavItem[] };

/** Full app navigation used by the desktop sidebar and the mobile "More" sheet. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/home", label: "Home", icon: House }],
  },
  {
    label: "Record",
    items: [
      { href: "/add", label: "Quick add", icon: Zap },
      { href: "/add/text", label: "Type it", icon: MessageSquareText },
      { href: "/add/voice", label: "Say it", icon: Mic },
      { href: "/transactions/new", label: "Full form", icon: SquarePen },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/accounts", label: "Wallets", icon: Wallet },
      { href: "/categories", label: "Categories", icon: Tags },
      { href: "/recurring", label: "Income & recurring", icon: Repeat },
    ],
  },
  {
    label: "Understand",
    items: [
      { href: "/insights", label: "Insights", icon: ChartPie },
      { href: "/insights/leaks", label: "Money leaks", icon: Droplets },
    ],
  },
  {
    label: "Plan",
    items: [
      { href: "/budgets", label: "Budgets", icon: Target },
      { href: "/goals", label: "Savings goals", icon: PiggyBank },
      { href: "/safe-to-spend", label: "Safe to spend", icon: Gauge },
      { href: "/survival", label: "Survival mode", icon: LifeBuoy },
    ],
  },
  {
    label: "Share",
    items: [{ href: "/reports", label: "Parent report", icon: FileText }],
  },
  {
    label: "You",
    items: [
      { href: "/rewards", label: "Rewards", icon: Trophy },
      { href: "/reminders", label: "Reminders", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** The five primary mobile tabs (spec §5). */
export const MOBILE_TABS: readonly NavItem[] = [
  { href: "/home", label: "Home", icon: House },
  {
    href: "/transactions",
    label: "Activity",
    icon: Receipt,
    also: ["/accounts", "/categories", "/recurring"],
  },
  { href: "/insights", label: "Insights", icon: ChartPie },
  {
    href: "/budgets",
    label: "Plan",
    icon: Target,
    also: ["/goals", "/safe-to-spend", "/survival"],
  },
  { href: "/reports", label: "Reports", icon: FileText },
];

/** Section tabs shown at the top of related screens so siblings are one tap away on mobile. */
export const SECTION_TABS = {
  record: NAV_GROUPS[1]!.items,
  insights: NAV_GROUPS[3]!.items,
  plan: NAV_GROUPS[4]!.items,
} as const;

/** Secondary routes that exist but are not navigation items. */
export const AUX_ROUTES = {
  welcome: "/welcome",
  onboarding: "/onboarding",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  settingsPrivacy: "/settings/privacy",
  settingsSync: "/settings/sync",
  settingsData: "/settings/data",
} as const satisfies Record<string, Route>;

function matchLength(pathname: string, prefix: string): number {
  if (pathname === prefix) return prefix.length;
  if (pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)) return prefix.length;
  return -1;
}

/**
 * Returns the item that best matches the pathname: the longest matching prefix wins, so
 * `/transactions/new` activates "Full form" rather than "Transactions".
 * Matches only on path-segment boundaries (`/goalsx` does not match `/goals`).
 */
export function findActiveItem<T extends NavItem>(
  pathname: string,
  items: readonly T[],
): T | undefined {
  let best: T | undefined;
  let bestLength = -1;
  for (const item of items) {
    for (const prefix of [item.href, ...(item.also ?? [])]) {
      const length = matchLength(pathname, prefix);
      if (length > bestLength) {
        best = item;
        bestLength = length;
      }
    }
  }
  return best;
}

export const ALL_NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap((group) => group.items);
