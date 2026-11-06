/** Built-in keywords for the default category hierarchy ("bus" → Transport › Bus), matched by name. */
import type { Category, CategoryKind } from "./schemas";
import { isCategoryActive } from "./category-tree";

// --- Built-in keywords ----------------------------------------------------------------------

/** keyword (normalized, may be a phrase) → [main category name, subcategory name | null]. */
export const KEYWORDS: Record<CategoryKind, ReadonlyArray<[string, string, string | null]>> = {
  expense: [
    ["tea", "Food & Drinks", "Tea"],
    ["chai", "Food & Drinks", "Tea"],
    ["coffee", "Food & Drinks", "Coffee"],
    ["snack", "Food & Drinks", "Snacks"],
    ["snacks", "Food & Drinks", "Snacks"],
    ["samosa", "Food & Drinks", "Snacks"],
    ["chips", "Food & Drinks", "Snacks"],
    ["biscuit", "Food & Drinks", "Snacks"],
    ["biscuits", "Food & Drinks", "Snacks"],
    ["breakfast", "Food & Drinks", "Breakfast"],
    ["lunch", "Food & Drinks", "Lunch"],
    ["dinner", "Food & Drinks", "Dinner"],
    ["groceries", "Food & Drinks", "Groceries"],
    ["grocery", "Food & Drinks", "Groceries"],
    ["vegetables", "Food & Drinks", "Groceries"],
    ["milk", "Food & Drinks", "Groceries"],
    ["cafe", "Food & Drinks", "Cafe"],
    ["swiggy", "Food & Drinks", "Delivery"],
    ["zomato", "Food & Drinks", "Delivery"],
    ["delivery", "Food & Drinks", "Delivery"],
    ["fees", "College", "Fees"],
    ["fee", "College", "Fees"],
    ["book", "College", "Books"],
    ["books", "College", "Books"],
    ["stationery", "College", "Stationery"],
    ["pen", "College", "Stationery"],
    ["notebook", "College", "Stationery"],
    ["printing", "College", "Printing"],
    ["print", "College", "Printing"],
    ["printout", "College", "Printing"],
    ["xerox", "College", "Printing"],
    ["photocopy", "College", "Printing"],
    ["assignment", "College", "Assignments"],
    ["project", "College", "Project components"],
    ["arduino", "College", "Project components"],
    ["fest", "College", "Events"],
    ["event", "College", "Events"],
    ["bus", "Transport", "Bus"],
    ["train", "Transport", "Train"],
    ["metro", "Transport", "Train"],
    ["auto", "Transport", "Auto"],
    ["rickshaw", "Transport", "Auto"],
    ["cab", "Transport", "Cab"],
    ["uber", "Transport", "Cab"],
    ["ola", "Transport", "Cab"],
    ["rapido", "Transport", "Cab"],
    ["petrol", "Transport", "Fuel"],
    ["fuel", "Transport", "Fuel"],
    ["parking", "Transport", "Parking"],
    ["clothes", "Personal", "Clothes"],
    ["shirt", "Personal", "Clothes"],
    ["haircut", "Personal", "Grooming"],
    ["salon", "Personal", "Grooming"],
    ["shampoo", "Personal", "Personal care"],
    ["soap", "Personal", "Personal care"],
    ["shopping", "Personal", "Shopping"],
    ["movie", "Entertainment", "Movies"],
    ["movies", "Entertainment", "Movies"],
    ["cinema", "Entertainment", "Movies"],
    ["game", "Entertainment", "Games"],
    ["games", "Entertainment", "Games"],
    ["outing", "Entertainment", "Outings"],
    ["trip", "Entertainment", "Outings"],
    ["hobby", "Entertainment", "Hobbies"],
    ["recharge", "Bills & Subscriptions", "Mobile recharge"],
    ["mobile data", "Bills & Subscriptions", "Mobile data"],
    ["data pack", "Bills & Subscriptions", "Mobile data"],
    ["netflix", "Bills & Subscriptions", "Subscriptions"],
    ["spotify", "Bills & Subscriptions", "Subscriptions"],
    ["subscription", "Bills & Subscriptions", "Subscriptions"],
    ["medicine", "Health & Fitness", "Medicines"],
    ["medicines", "Health & Fitness", "Medicines"],
    ["pharmacy", "Health & Fitness", "Medicines"],
    ["doctor", "Health & Fitness", "Appointments"],
    ["gym", "Health & Fitness", "Gym"],
  ],
  income: [
    ["allowance", "Allowance", null],
    ["pocket money", "Allowance", null],
    ["salary", "Part-time work", null],
    ["stipend", "Part-time work", null],
    ["freelance", "Part-time work", null],
    ["scholarship", "Scholarship", null],
    ["gift", "Gifts", null],
    ["birthday", "Gifts", null],
  ],
};

export function findByName(
  categories: readonly Category[],
  kind: CategoryKind,
  main: string,
  sub: string | null,
) {
  const mainCat = categories.find(
    (c) =>
      c.kind === kind &&
      c.parentId === null &&
      isCategoryActive(c) &&
      c.name.toLowerCase() === main.toLowerCase(),
  );
  if (!mainCat) return null;
  const subCat = sub
    ? categories.find(
        (c) =>
          c.parentId === mainCat.id &&
          isCategoryActive(c) &&
          c.name.toLowerCase() === sub.toLowerCase(),
      )
    : undefined;
  return { categoryId: mainCat.id, subcategoryId: subCat?.id ?? null };
}
