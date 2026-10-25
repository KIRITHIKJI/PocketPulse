import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  ALL_NAV_ITEMS,
  AUX_ROUTES,
  MOBILE_TABS,
  SECTION_TABS,
  findActiveItem,
} from "@/lib/navigation";

const APP_DIR = join(process.cwd(), "src", "app");

/** Resolves a URL path to a page file, looking through route groups like `(app)`. */
function pageExists(path: string, dir = APP_DIR): boolean {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return existsSync(join(dir, "page.tsx"));
  const [head, ...rest] = segments;
  const restPath = `/${rest.join("/")}`;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry.startsWith("(") && entry.endsWith(")") && pageExists(path, full)) return true;
    const isDynamic = entry.startsWith("[") && entry.endsWith("]");
    if ((entry === head || isDynamic) && pageExists(restPath, full)) return true;
  }
  return false;
}

describe("findActiveItem", () => {
  it("prefers the most specific match", () => {
    expect(findActiveItem("/transactions/new", ALL_NAV_ITEMS)?.label).toBe("Full form");
    expect(findActiveItem("/transactions/abc-123", ALL_NAV_ITEMS)?.label).toBe("Transactions");
    expect(findActiveItem("/add/text", ALL_NAV_ITEMS)?.label).toBe("Type it");
    expect(findActiveItem("/add", ALL_NAV_ITEMS)?.label).toBe("Quick add");
    expect(findActiveItem("/insights/leaks", ALL_NAV_ITEMS)?.label).toBe("Money leaks");
  });

  it("only matches on path-segment boundaries", () => {
    expect(findActiveItem("/goalsx", ALL_NAV_ITEMS)).toBeUndefined();
    expect(findActiveItem("/homepage", MOBILE_TABS)).toBeUndefined();
  });

  it("maps planning screens to the Plan mobile tab", () => {
    for (const path of ["/budgets", "/goals", "/safe-to-spend", "/survival"]) {
      expect(findActiveItem(path, MOBILE_TABS)?.label).toBe("Plan");
    }
    expect(findActiveItem("/insights/leaks", MOBILE_TABS)?.label).toBe("Insights");
    expect(findActiveItem("/settings", MOBILE_TABS)).toBeUndefined();
  });
});

describe("navigation structure", () => {
  it("has exactly the five primary mobile destinations from the spec", () => {
    expect(MOBILE_TABS.map((tab) => tab.href)).toEqual([
      "/home",
      "/transactions",
      "/insights",
      "/budgets",
      "/reports",
    ]);
  });

  it("has no duplicate navigation destinations", () => {
    const hrefs = ALL_NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("only uses section tabs drawn from real nav items", () => {
    for (const items of Object.values(SECTION_TABS)) {
      for (const item of items) expect(ALL_NAV_ITEMS).toContain(item);
    }
  });

  it.each([...ALL_NAV_ITEMS.map((item) => item.href), ...Object.values(AUX_ROUTES)])(
    "route %s has a page",
    (href) => {
      expect(pageExists(href)).toBe(true);
    },
  );
});

describe("spec §5 screen coverage", () => {
  // Every screen listed in PROJECT_SPEC.md §5 must have a reachable route.
  const SCREENS: Record<string, string[]> = {
    "Welcome/onboarding": ["/welcome", "/onboarding"],
    "Registration, login, password recovery": [
      "/register",
      "/login",
      "/forgot-password",
      "/reset-password",
    ],
    "Dashboard/Home": ["/home"],
    "Quick-add interface": ["/add"],
    "Full transaction form": ["/transactions/new"],
    "Natural-language entry and preview": ["/add/text"],
    "Voice entry and preview": ["/add/voice"],
    "Transaction history, detail, edit": [
      "/transactions",
      "/transactions/some-id",
      "/transactions/some-id/edit",
    ],
    "Categories and subcategories management": ["/categories"],
    "Spending Insights and charts": ["/insights"],
    "Money Leak Detector": ["/insights/leaks"],
    Budgets: ["/budgets"],
    "Savings goals and pockets": ["/goals"],
    "Safe-to-Spend calculator": ["/safe-to-spend"],
    "Pocket-Money Survival Mode": ["/survival"],
    "Income and recurring templates": ["/recurring"],
    "Parent Report Mode": ["/reports"],
    Gamification: ["/rewards"],
    "Reminders/notifications": ["/reminders"],
    "Profile, preferences, privacy, sync, data export, deletion": [
      "/settings",
      "/settings/privacy",
      "/settings/sync",
      "/settings/data",
    ],
  };

  it.each(Object.entries(SCREENS))("%s", (_screen, routes) => {
    for (const route of routes) expect(pageExists(route), route).toBe(true);
  });
});
