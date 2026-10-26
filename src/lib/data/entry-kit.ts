import "server-only";

import {
  type Account,
  type Category,
  type CategoryRule,
  type CurrencyCode,
  type LocalDate,
  type Transaction,
  toLocalDate,
} from "@/domain";
import {
  ensureDefaultAccount,
  getAccounts,
  getCategories,
  getCategoryRules,
  getLedger,
  getProfile,
} from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
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

const HISTORY_FOR_SUGGESTIONS = 400;

export async function loadEntryKit(): Promise<EntryKit> {
  const session = await requireSession();
  // Every entry form preselects the default wallet, created ("Cash") if the user has none.
  const defaultAccount = await ensureDefaultAccount(session);
  const [profile, accounts, categories, rules, ledger] = await Promise.all([
    getProfile(),
    getAccounts(),
    getCategories(),
    getCategoryRules(),
    getLedger(),
  ]);
  return {
    currency: profile.currency,
    timeZone: profile.timeZone,
    today: toLocalDate(requestNow(), profile.timeZone),
    accounts: accounts.map(({ sortOrder: _sortOrder, ...account }) => account),
    defaultAccountId: defaultAccount.id,
    expenseTree: pickerTree(categories, "expense"),
    incomeTree: pickerTree(categories, "income"),
    categories,
    rules,
    history: ledger
      .filter((tx) => (tx.type === "expense" || tx.type === "income") && tx.categoryId !== null)
      .slice(0, HISTORY_FOR_SUGGESTIONS),
  };
}
