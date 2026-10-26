import {
  type Category,
  type CategoryRule,
  type Transaction,
  categoryLabel,
  categoryRuleSchema,
  categorySchema,
  categoryTree,
  normalizeText,
  resolveCategoryChoice,
  suggestCategory,
  uncategorizedQueue,
} from "@/domain";

import { OWNER, expense, id, income, ist, refund } from "./fixtures";

// --- A small hierarchy shaped like the seeded defaults --------------------------------------

const FOOD = id(500);
const TEA = id(501);
const COFFEE = id(502);
const SNACKS = id(503);
const TRANSPORT = id(510);
const BUS = id(511);
const AUTO = id(512);
const COLLEGE = id(520);
const PRINTING = id(521);
const ALLOWANCE = id(530);
const CAFE_OLD = id(540); // merged into Coffee
const HOBBIES = id(550); // archived
const CHAI_SPOT = id(560); // custom category

function cat(
  catId: string,
  name: string,
  extra: Partial<Category> & { parentId?: string | null } = {},
): Category {
  return categorySchema.parse({ id: catId, ownerId: OWNER, name, ...extra });
}

const CATEGORIES: Category[] = [
  cat(FOOD, "Food & Drinks", { sortOrder: 0, icon: "utensils" }),
  cat(TEA, "Tea", { parentId: FOOD, sortOrder: 0 }),
  cat(COFFEE, "Coffee", { parentId: FOOD, sortOrder: 1 }),
  cat(SNACKS, "Snacks", { parentId: FOOD, sortOrder: 2 }),
  cat(CAFE_OLD, "Cafe", {
    parentId: FOOD,
    sortOrder: 3,
    mergedIntoId: COFFEE,
    archivedAt: "2026-10-10T10:00:00+05:30",
  }),
  cat(TRANSPORT, "Transport", { sortOrder: 1 }),
  cat(BUS, "Bus", { parentId: TRANSPORT, sortOrder: 0 }),
  cat(AUTO, "Auto", { parentId: TRANSPORT, sortOrder: 1 }),
  cat(COLLEGE, "College", { sortOrder: 2 }),
  cat(PRINTING, "Printing", { parentId: COLLEGE, sortOrder: 0 }),
  cat(HOBBIES, "Hobbies", { sortOrder: 3, archivedAt: "2026-10-10T10:00:00+05:30" }),
  cat(CHAI_SPOT, "Chai spot", { sortOrder: 4 }),
  cat(ALLOWANCE, "Allowance", { kind: "income", sortOrder: 0 }),
];

let ruleSeq = 0;
function rule(
  matchText: string,
  categoryId: string,
  subcategoryId: string | null,
  extra: Partial<CategoryRule> = {},
) {
  return categoryRuleSchema.parse({
    id: id(800 + ruleSeq++),
    ownerId: OWNER,
    matchText,
    categoryId,
    subcategoryId,
    ...extra,
  });
}

const ctx = (extra: { rules?: CategoryRule[]; history?: Transaction[] } = {}) => ({
  categories: CATEGORIES,
  ...extra,
});

describe("normalizeText", () => {
  it("lowercases, drops digits/symbols and collapses spaces", () => {
    expect(normalizeText("  Masala CHAI @ Ramu's!! ₹15 ")).toBe("masala chai ramu s");
    expect(normalizeText(null)).toBe("");
    expect(normalizeText("₹40")).toBe("");
  });
});

describe("rules", () => {
  it("“chai” → Food & Drinks › Tea, matching whole words in any case", () => {
    const rules = [rule("chai", FOOD, TEA)];
    const s = suggestCategory({ description: "Masala Chai near hostel" }, ctx({ rules }));
    expect(s).toMatchObject({ categoryId: FOOD, subcategoryId: TEA, source: "rule" });
    expect(s?.reason).toBe("Your rule: description has “chai”");
    // Not a substring of another word.
    expect(suggestCategory({ description: "chaitanya books" }, ctx({ rules }))?.source).not.toBe(
      "rule",
    );
  });

  it("matches phrases and the merchant field when asked", () => {
    const rules = [
      rule("blue tokai", FOOD, COFFEE, { matchField: "merchant" }),
      rule("xerox shop", COLLEGE, PRINTING),
    ];
    expect(
      suggestCategory({ description: "beans", merchant: "Blue Tokai Koramangala" }, ctx({ rules })),
    ).toMatchObject({ subcategoryId: COFFEE, source: "rule" });
    // A merchant rule doesn't look at the description.
    expect(suggestCategory({ description: "blue tokai" }, ctx({ rules }))?.source).not.toBe("rule");
    expect(suggestCategory({ description: "the Xerox  Shop" }, ctx({ rules }))).toMatchObject({
      subcategoryId: PRINTING,
    });
  });

  it("orders by priority, then the longest phrase, then id — regardless of input order", () => {
    const low = rule("tea", FOOD, TEA);
    const long = rule("green tea", FOOD, COFFEE);
    const high = rule("tea", CHAI_SPOT, null, { priority: 5 });
    for (const rules of [
      [low, long, high],
      [high, long, low],
      [long, high, low],
    ]) {
      expect(suggestCategory({ description: "green tea" }, ctx({ rules }))?.categoryId).toBe(
        CHAI_SPOT,
      );
    }
    expect(
      suggestCategory({ description: "green tea" }, ctx({ rules: [low, long] })),
    ).toMatchObject({
      subcategoryId: COFFEE,
    });
  });

  it("skips rules pointing at archived categories and follows merges", () => {
    const rules = [rule("lego", HOBBIES, null), rule("latte", FOOD, CAFE_OLD)];
    expect(suggestCategory({ description: "lego set" }, ctx({ rules }))).toBeNull();
    expect(suggestCategory({ description: "latte" }, ctx({ rules }))).toMatchObject({
      categoryId: FOOD,
      subcategoryId: COFFEE,
      source: "rule",
    });
  });

  it("an expense rule never suggests for income, and vice versa", () => {
    const rules = [rule("stipend", ALLOWANCE, null)];
    expect(suggestCategory({ description: "stipend", kind: "expense" }, ctx({ rules }))).toBeNull();
    expect(
      suggestCategory({ description: "stipend", kind: "income" }, ctx({ rules })),
    ).toMatchObject({ categoryId: ALLOWANCE, source: "rule" });
  });
});

describe("prior choices", () => {
  it("uses what the user chose before for the same text, overriding built-in keywords", () => {
    // The keyword list says "tea" → Tea, but this user files "tea" under Chai spot.
    const history = [
      expense(1500, { description: "Tea", categoryId: CHAI_SPOT, occurredAt: ist("2026-10-01") }),
      expense(1500, { description: "tea", categoryId: CHAI_SPOT, occurredAt: ist("2026-10-02") }),
      expense(1500, {
        description: "TEA",
        categoryId: FOOD,
        subcategoryId: TEA,
        occurredAt: ist("2026-10-03"),
      }),
    ];
    const s = suggestCategory({ description: "tea" }, ctx({ history }));
    expect(s).toMatchObject({
      categoryId: CHAI_SPOT,
      subcategoryId: null,
      source: "history",
      evidence: 2,
    });
    expect(s?.reason).toBe("You chose this 2 times for “tea”");
  });

  it("breaks ties by the most recent choice, so a change of mind wins", () => {
    const history = [
      expense(2000, {
        description: "samosa",
        categoryId: FOOD,
        subcategoryId: SNACKS,
        occurredAt: ist("2026-10-01"),
      }),
      expense(2000, {
        description: "samosa",
        categoryId: CHAI_SPOT,
        occurredAt: ist("2026-10-04"),
      }),
    ];
    expect(suggestCategory({ description: "Samosa" }, ctx({ history }))?.categoryId).toBe(
      CHAI_SPOT,
    );
    expect(
      suggestCategory({ description: "Samosa" }, ctx({ history: [...history].reverse() }))
        ?.categoryId,
    ).toBe(CHAI_SPOT);
  });

  it("falls back to entries sharing a meaningful word", () => {
    const history = [
      expense(2000, { description: "bus to college", categoryId: TRANSPORT, subcategoryId: BUS }),
    ];
    const s = suggestCategory({ description: "bus home" }, ctx({ history }));
    expect(s).toMatchObject({ subcategoryId: BUS, source: "similar", evidence: 1 });
    // Filler words alone ("to") never make entries similar.
    expect(suggestCategory({ description: "to" }, ctx({ history }))).toBeNull();
  });

  it("ignores deleted, uncategorised, refund and other-kind history; resolves merged choices", () => {
    const deleted = expense(100, {
      description: "latte",
      categoryId: TRANSPORT,
      deletedAt: "2026-10-06T10:00:00+05:30",
    });
    const uncategorised = expense(100, { description: "latte", categoryId: null });
    const merged = expense(100, {
      description: "latte",
      categoryId: FOOD,
      subcategoryId: CAFE_OLD,
    });
    const someIncome = income(100, { description: "latte", categoryId: ALLOWANCE });
    const s = suggestCategory(
      { description: "latte" },
      ctx({
        history: [
          deleted,
          uncategorised,
          merged,
          someIncome,
          refund(50, merged.id, { description: "latte" }),
        ],
      }),
    );
    expect(s).toMatchObject({
      categoryId: FOOD,
      subcategoryId: COFFEE,
      source: "history",
      evidence: 1,
    });
  });
});

describe("built-in keywords", () => {
  it("map common words onto the user's categories by name", () => {
    expect(suggestCategory({ description: "Auto to station" }, ctx())).toMatchObject({
      categoryId: TRANSPORT,
      subcategoryId: AUTO,
      source: "keyword",
      reason: "Matched the word “auto”",
    });
    expect(suggestCategory({ description: "xerox notes" }, ctx())).toMatchObject({
      subcategoryId: PRINTING,
    });
  });

  it("use the earliest keyword in the text", () => {
    expect(suggestCategory({ description: "tea and samosa" }, ctx())?.subcategoryId).toBe(TEA);
    expect(suggestCategory({ description: "samosa and tea" }, ctx())?.subcategoryId).toBe(SNACKS);
  });

  it("fall back to the main category when the subcategory is missing, and to null otherwise", () => {
    // "uber" → Transport › Cab; this user has no Cab subcategory.
    expect(suggestCategory({ description: "uber" }, ctx())).toMatchObject({
      categoryId: TRANSPORT,
      subcategoryId: null,
    });
    // "movie" → Entertainment, which this user doesn't have.
    expect(suggestCategory({ description: "movie night" }, ctx())).toBeNull();
    expect(suggestCategory({ description: "₹40" }, ctx())).toBeNull();
    expect(suggestCategory({ description: "" }, ctx())).toBeNull();
  });

  it("handle income words", () => {
    expect(
      suggestCategory({ description: "Pocket money from amma", kind: "income" }, ctx()),
    ).toMatchObject({
      categoryId: ALLOWANCE,
    });
  });
});

describe("precedence and determinism", () => {
  it("rules beat history, history beats keywords", () => {
    const history = [expense(1500, { description: "tea", categoryId: CHAI_SPOT })];
    const rules = [rule("tea", COLLEGE, null)];
    expect(suggestCategory({ description: "tea" }, ctx({ rules, history }))?.categoryId).toBe(
      COLLEGE,
    );
    expect(suggestCategory({ description: "tea" }, ctx({ history }))?.categoryId).toBe(CHAI_SPOT);
    expect(suggestCategory({ description: "tea" }, ctx())?.subcategoryId).toBe(TEA);
  });

  it("gives the same answer for any ordering of categories, rules and history", () => {
    const history = [
      expense(1500, { description: "chai", categoryId: FOOD, subcategoryId: TEA }),
      expense(1500, { description: "chai", categoryId: CHAI_SPOT }),
    ];
    const rules = [rule("coffee", FOOD, COFFEE), rule("bus", TRANSPORT, BUS)];
    const a = suggestCategory({ description: "chai" }, { categories: CATEGORIES, rules, history });
    const b = suggestCategory(
      { description: "chai" },
      {
        categories: [...CATEGORIES].reverse(),
        rules: [...rules].reverse(),
        history: [...history].reverse(),
      },
    );
    expect(b).toEqual(a);
  });
});

describe("hierarchy helpers", () => {
  it("categoryTree lists active categories in display order", () => {
    const tree = categoryTree(CATEGORIES, "expense");
    expect(tree.map((n) => n.category.name)).toEqual([
      "Food & Drinks",
      "Transport",
      "College",
      "Chai spot",
    ]);
    expect(tree[0]!.subcategories.map((c) => c.name)).toEqual(["Tea", "Coffee", "Snacks"]);
    const all = categoryTree(CATEGORIES, "expense", { includeInactive: true });
    expect(all.map((n) => n.category.name)).toContain("Hobbies");
    expect(all[0]!.subcategories.map((c) => c.name)).toContain("Cafe");
  });

  it("resolveCategoryChoice follows merges and drops archived choices", () => {
    const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
    expect(resolveCategoryChoice({ categoryId: FOOD, subcategoryId: CAFE_OLD }, byId)).toEqual({
      categoryId: FOOD,
      subcategoryId: COFFEE,
    });
    expect(resolveCategoryChoice({ categoryId: HOBBIES, subcategoryId: null }, byId)).toBeNull();
    expect(
      resolveCategoryChoice({ categoryId: ALLOWANCE, subcategoryId: null }, byId, "expense"),
    ).toBeNull();
    expect(categoryLabel({ categoryId: FOOD, subcategoryId: TEA }, byId)).toBe(
      "Food & Drinks › Tea",
    );
  });

  it("uncategorizedQueue lists active uncategorised expenses, newest first", () => {
    const older = expense(1000, { categoryId: null, occurredAt: ist("2026-10-01") });
    const newer = expense(2000, { categoryId: null, occurredAt: ist("2026-10-03") });
    const done = expense(3000, { categoryId: FOOD });
    const gone = expense(4000, { categoryId: null, deletedAt: "2026-10-04T10:00:00+05:30" });
    const ledger = [
      older,
      done,
      gone,
      newer,
      refund(500, older.id),
      income(9000, { categoryId: null }),
    ];
    expect(uncategorizedQueue(ledger).map((t) => t.id)).toEqual([newer.id, older.id]);
  });
});
