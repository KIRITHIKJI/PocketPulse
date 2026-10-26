import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";

import type { PickerNode } from "@/components/categories/category-picker";
import { Field, MoneyField, SelectField } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Account, TransactionType } from "@/domain";
import { TYPE_LABELS } from "@/lib/entry-view";
import { paiseToInput } from "@/lib/format";
import { type FilterErrors, type HistoryFilters, UNCATEGORIZED_FILTER } from "@/lib/history";

const TYPES: TransactionType[] = [
  "expense",
  "income",
  "refund",
  "transfer",
  "allocation",
  "allocation_release",
];

/**
 * Search and filters as a plain GET form: the URL holds the state, so filtered views can be
 * bookmarked, and the form works before JavaScript loads.
 */
export function HistoryFilterForm({
  filters,
  errors,
  activeCount,
  accounts,
  expenseTree,
  incomeTree,
}: {
  filters: HistoryFilters;
  errors: FilterErrors;
  activeCount: number;
  accounts: Account[];
  expenseTree: PickerNode[];
  incomeTree: PickerNode[];
}) {
  const categoryOptions = (tree: PickerNode[]) =>
    tree.map((node) => (
      <optgroup key={node.id} label={node.name}>
        <option value={node.id}>{node.name} (all)</option>
        {node.subcategories.map((sub) => (
          <option key={sub.id} value={sub.id}>
            {node.name} › {sub.name}
          </option>
        ))}
      </optgroup>
    ));
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form method="get" action="/transactions" role="search" className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search description, merchant, note, tag, category"
            aria-label="Search transactions"
            className="pl-9"
            enterKeyHint="search"
          />
        </div>
        <Button type="submit">Search</Button>
      </div>

      <details className="group rounded-2xl border bg-card" open={activeCount > 0 || hasErrors}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </summary>
        <div className="grid gap-4 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField id="filter-type" name="type" label="Type" defaultValue={filters.type ?? ""}>
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </SelectField>
          <SelectField
            id="filter-category"
            name="category"
            label="Category"
            defaultValue={filters.category ?? ""}
          >
            <option value="">All categories</option>
            <option value={UNCATEGORIZED_FILTER}>Uncategorized</option>
            {categoryOptions(expenseTree)}
            {categoryOptions(incomeTree)}
          </SelectField>
          <SelectField
            id="filter-account"
            name="account"
            label="Wallet"
            defaultValue={filters.account ?? ""}
          >
            <option value="">All wallets</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.archivedAt ? " (archived)" : ""}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <MoneyField
              id="filter-min"
              name="min"
              label="Min amount"
              defaultValue={paiseToInput(filters.minPaise)}
              error={errors.min}
            />
            <MoneyField
              id="filter-max"
              name="max"
              label="Max amount"
              defaultValue={paiseToInput(filters.maxPaise)}
              error={errors.max}
            />
          </div>
          <Field
            id="filter-from"
            name="from"
            type="date"
            label="From"
            defaultValue={filters.from ?? ""}
            error={errors.from}
          />
          <Field
            id="filter-to"
            name="to"
            type="date"
            label="To"
            defaultValue={filters.to ?? ""}
            error={errors.to}
          />
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit">Apply filters</Button>
            {(activeCount > 0 || filters.q) && (
              <Button variant="ghost" asChild>
                <Link href="/transactions">Clear all</Link>
              </Button>
            )}
          </div>
        </div>
      </details>
    </form>
  );
}
