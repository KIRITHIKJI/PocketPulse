/**
 * Maps database errors to user-facing copy. Integrity rules raise SQLSTATE P0001 with a stable
 * machine-readable message (see supabase/migrations/…_integrity.sql); everything else gets a
 * generic message. Raw database text is never shown, and nothing about the row is logged.
 */
const RULES: Record<string, string> = {
  default_account_archived: "Choose another default wallet before archiving this one.",
  account_archived: "Restore this wallet first.",
  account_not_found: "That wallet doesn’t exist any more.",
  account_currency_locked: "This wallet already has entries in its currency.",
  currency_locked:
    "Currency can’t change after your first entry, so your totals never mix currencies.",
  reorder_mismatch: "The list changed on another device. Reload the page and try again.",
  merge_same_category: "Choose a different category to merge into.",
  merge_main_into_sub: "A main category can only merge into another main category.",
  category_inactive: "Restore archived categories before merging.",
  category_kind_mismatch: "Spending and income categories can’t be mixed.",
  category_kind_immutable: "A category can’t switch between spending and income.",
  category_too_deep: "Subcategories can’t have their own subcategories.",
  category_has_children: "A category with subcategories can’t become a subcategory.",
  category_not_top_level: "Choose a main category, then optionally a subcategory.",
  subcategory_mismatch: "That subcategory belongs to a different category.",
  not_authenticated: "Your session ended. Sign in again.",
  currency_mismatch: "That entry’s currency doesn’t match the wallet’s currency.",
  refund_without_expense: "Choose the expense this refund is for.",
  refund_of_inactive_expense: "That expense was deleted, so it can’t be refunded.",
  refund_before_expense: "A refund can’t be dated before the purchase it refunds.",
  refund_exceeds_expense: "Refunds can’t add up to more than the original expense.",
  expense_has_refunds: "This expense has refunds. Delete the refunds first.",
  expense_below_refunds: "The expense can’t be smaller than what was already refunded.",
  transaction_field_immutable:
    "That part of an entry can’t be changed. Delete it and add a new one.",
  invalid_payload: "Something in that entry isn’t valid. Check it and try again.",
  missing_id: "Something in that entry isn’t valid. Check it and try again.",
};

export interface DbError {
  code?: string | undefined;
  message?: string | undefined;
}

export function dbErrorMessage(error: DbError | null | undefined, uniqueMessage?: string): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.code === "P0001" && error.message && RULES[error.message]) return RULES[error.message]!;
  if (error.code === "23505") return uniqueMessage ?? "That name is already in use.";
  if (error.code === "42501") return "You don’t have access to that.";
  if (error.code === "23503")
    return "A wallet, category or expense it uses doesn’t exist any more. Reload and try again.";
  if (error.code === "23514")
    return "One of the values isn’t allowed. Check the form and try again.";
  return "Something went wrong saving that. Try again.";
}

/** Error for loaders: the route's error boundary shows a retry state; no row data is included. */
export class DataLoadError extends Error {
  override name = "DataLoadError";
  constructor(what: string, code?: string) {
    super(`Couldn’t load ${what}${code ? ` (${code})` : ""}.`);
  }
}
