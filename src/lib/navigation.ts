import type { Route } from "next";
import {
  Bell,
  ChartPie,
  Droplets,
  FileText,
  Gauge,
  House,
  LifeBuoy,
  ListChecks,
  Medal,
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
  UserRound,
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
  /** A progression screen: hidden from navigation when progress features are off (Settings). */
  progress?: true;
};

type NavGroup = {
  label: string;
  items: readonly NavItem[];
  /** Drawn as bordered entry buttons in the sidebar (Record), so they read as actions. */
  grid?: true;
  /** Leads the sidebar without a label (Overview: Home alone needs no heading). */
  lead?: true;
};

const PROGRESS_ITEMS: readonly NavItem[] = [
  { href: "/rewards/status", label: "Player status", icon: UserRound, progress: true },
  { href: "/rewards/missions", label: "Missions", icon: ListChecks, progress: true },
  { href: "/rewards/achievements", label: "Achievements", icon: Medal, progress: true },
  { href: "/rewards", label: "Rewards", icon: Trophy, progress: true },
];

/** Full app navigation used by the desktop sidebar and the mobile You sheet (doc/DESIGN_PLAN.md §5). */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Overview",
    lead: true,
    items: [{ href: "/home", label: "Home", icon: House }],
  },
  {
    label: "Record",
    grid: true,
    items: [
      { href: "/add", label: "Quick add", icon: Zap },
      { href: "/add/text", label: "Type it", icon: MessageSquareText },
      { href: "/add/voice", label: "Say it", icon: Mic },
      { href: "/transactions/new", label: "Full form", icon: SquarePen },
    ],
  },
  {
    label: "Activity",
    items: [
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/accounts", label: "Wallets", icon: Wallet },
      { href: "/categories", label: "Categories", icon: Tags },
      { href: "/recurring", label: "Income & recurring", icon: Repeat },
    ],
  },
  {
    label: "Insights",
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
  { label: "Progress", items: PROGRESS_ITEMS },
  {
    label: "You",
    items: [
      { href: "/reports", label: "Parent report", icon: FileText },
      { href: "/reminders", label: "Reminders", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/**
 * The mobile bottom bar (doc/DESIGN_PLAN.md §5): Home · Activity · Add · Insights · Plan · You.
 * These are the four link tabs; Add is docked in the middle and You opens the `YOU_ITEMS` sheet.
 */
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
];

/** The "You" tab's sheet: progress first, then the secondary screens. Reports is two taps away. */
export const YOU_ITEMS: readonly NavItem[] = [
  ...PROGRESS_ITEMS,
  { href: "/reports", label: "Parent report", icon: FileText },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Section tabs shown at the top of related screens so siblings are one tap away on mobile. */
export const SECTION_TABS = {
  record: NAV_GROUPS[1]!.items,
  insights: NAV_GROUPS[3]!.items,
  plan: NAV_GROUPS[4]!.items,
  progress: PROGRESS_ITEMS,
} as const;

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

/** Navigation without progression screens, for when progress features are off. */
export function visibleItems<T extends NavItem>(items: readonly T[], showProgress: boolean): T[] {
  return showProgress ? [...items] : items.filter((item) => !item.progress);
}

export function visibleGroups(showProgress: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: visibleItems(group.items, showProgress),
  })).filter((group) => group.items.length > 0);
}
