import "server-only";

import {
  type Account,
  type Category,
  type CategoryRule,
  type CurrencyCode,
  type LocalDate,
  type Transaction,
} from "@/domain";
import {
  getAccountsWithDefault,
  getCategories,
  getCategoryRules,
  getProfile,
  getSuggestionHistory,
} from "@/lib/data/queries";
import { requestToday } from "@/lib/data/session";
import { type PickerNode, pickerTree } from "@/lib/picker-tree";

/** Everything an entry screen needs on the client: wallets, categories and suggestion inputs. */
export interface EntryKit {
  currency: CurrencyCode;
  timeZone: string;
  today: LocalDate;
  /** All wallets (archived ones too, for labels); pickers offer only active ones. */
  accounts: Account[];
  defaultAccountId: string;
  expenseTree: PickerNode[];
  incomeTree: PickerNode[];
  categories: Category[];
  rules: CategoryRule[];
  /** Recent categorised spending/income — what "you chose this before" suggestions learn from. */
  history: Transaction[];
}

export async function loadEntryKit(): Promise<EntryKit> {
  // Every entry form preselects the default wallet, created ("Cash") if the user has none.
  const [profile, { accounts, defaultAccount }, categories, rules, history] = await Promise.all([
    getProfile(),
    getAccountsWithDefault(),
    getCategories(),
    getCategoryRules(),
    getSuggestionHistory(),
  ]);
  return {
    currency: profile.currency,
    timeZone: profile.timeZone,
    today: requestToday(profile.timeZone),
    accounts: accounts.map(({ sortOrder: _sortOrder, ...account }) => account),
    defaultAccountId: defaultAccount.id,
    expenseTree: pickerTree(categories, "expense"),
    incomeTree: pickerTree(categories, "income"),
    categories,
    rules,
    history,
  };
}
