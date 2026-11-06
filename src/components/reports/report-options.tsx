import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type Category, type ReportOptions, hiddenRowLabel } from "@/domain";
import type { InsightSelection } from "@/lib/insights-view";
import { mainExpenseCategories } from "@/lib/plan-view";

function OptionBox({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="hidden" name={name} value="0" />
      <input
        type="checkbox"
        name={name}
        value="1"
        defaultChecked={checked}
        className="size-4 accent-[var(--primary)]"
      />
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
    <Card className="gap-3">
      <h2 className="font-semibold">What to include</h2>
      <form method="get" action="/reports" className="flex flex-col gap-3">
        <input type="hidden" name="period" value={selection.kind} />
        {selection.kind === "custom" && (
          <>
            <input type="hidden" name="from" value={selection.customFrom} />
            <input type="hidden" name="to" value={selection.customTo} />
          </>
        )}
        <div className="flex flex-wrap gap-x-5">
          <OptionBox name="details" label="Every entry" checked={options.includeTransactions} />
          <OptionBox name="notes" label="Notes" checked={options.includeNotes} />
          <OptionBox
            name="compare"
            label="Compare with the earlier period"
            checked={options.compare}
          />
        </div>
        <details>
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-medium">
            Hide categories
            {options.hiddenCategoryIds.length > 0
              ? ` (${options.hiddenCategoryIds.length} hidden)`
              : ""}
          </summary>
          <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
            {mainExpenseCategories(categories).map((category) => (
              <label key={category.id} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="hide"
                  value={category.id}
                  defaultChecked={options.hiddenCategoryIds.includes(category.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                {category.name}
              </label>
            ))}
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            A hidden category’s name and entries are left out. Its money stays in the totals, under
            “{hiddenRowLabel()}”, so the report still adds up.
          </p>
        </details>
        <Button type="submit" variant="outline" className="self-start">
          Update preview
        </Button>
      </form>
    </Card>
  );
}
