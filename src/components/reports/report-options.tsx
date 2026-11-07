import { Button } from "@/components/ui/button";
import { type Category, type ReportOptions, hiddenRowLabel } from "@/domain";
import type { InsightSelection } from "@/lib/insights-view";
import { mainExpenseCategories } from "@/lib/plan-view";

const BOX = "size-4 shrink-0 accent-primary";
const LABEL = "flex min-h-10 items-center gap-2 type-body pointer-coarse:min-h-11";

function OptionBox({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className={LABEL}>
      <input type="hidden" name={name} value="0" />
      <input type="checkbox" name={name} value="1" defaultChecked={checked} className={BOX} />
      {label}
    </label>
  );
}

/** The report's options as a GET form: entries, notes, comparison and hidden categories. */
export function ReportOptionsForm({
  selection,
  options,
  categories,
}: {
  selection: InsightSelection;
  options: ReportOptions;
  categories: readonly Category[];
}) {
  return (
    <form method="get" action="/reports" className="flex flex-col gap-stack">
      <input type="hidden" name="period" value={selection.kind} />
      {selection.kind === "custom" && (
        <>
          <input type="hidden" name="from" value={selection.customFrom} />
          <input type="hidden" name="to" value={selection.customTo} />
        </>
      )}
      <fieldset className="flex flex-col">
        <legend className="pb-1 type-caption font-medium text-text-secondary">
          What to include
        </legend>
        <OptionBox name="details" label="Every entry" checked={options.includeTransactions} />
        <OptionBox name="notes" label="Notes" checked={options.includeNotes} />
        <OptionBox
          name="compare"
          label="Compare with the earlier period"
          checked={options.compare}
        />
      </fieldset>
      <details className="group rounded-xl bg-surface-inset px-3">
        <summary className="flex min-h-11 cursor-pointer items-center type-body font-medium">
          Hide categories
          {options.hiddenCategoryIds.length > 0 ? (
            <span className="money">&nbsp;({options.hiddenCategoryIds.length} hidden)</span>
          ) : (
            ""
          )}
        </summary>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-1">
          {mainExpenseCategories(categories).map((category) => (
            <label key={category.id} className={LABEL}>
              <input
                type="checkbox"
                name="hide"
                value={category.id}
                defaultChecked={options.hiddenCategoryIds.includes(category.id)}
                className={BOX}
              />
              <span className="min-w-0 truncate">{category.name}</span>
            </label>
          ))}
        </div>
        <p className="pt-1 pb-3 type-caption text-text-secondary">
          A hidden category’s name and entries are left out. Its money stays in the totals, under “
          {hiddenRowLabel()}”, so the report still adds up.
        </p>
      </details>
      <Button type="submit" variant="outline" className="self-start">
        Update preview
      </Button>
    </form>
  );
}
