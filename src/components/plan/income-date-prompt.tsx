import Link from "next/link";
import { CalendarDays } from "lucide-react";

import { InlineAction } from "@/components/forms/inline-action";
import { StatePanel } from "@/components/states/state-panel";
import { Button } from "@/components/ui/button";
import { type IncomeFrequency, proposedNextIncomeDate } from "@/domain";
import { setNextIncomeDate } from "@/lib/actions/recurring";
import { formatLocalDate } from "@/lib/format";

/**
 * Shown instead of a daily limit when there's no usable next income date. A passed date with a
 * regular frequency offers the next one, but only the user can accept it: nothing here guesses.
 * `form` puts the date field itself in the panel, so the fix is right where the question is.
 */
export function IncomeDatePrompt({
  nextIncomeDate,
  frequency,
  today,
  form,
  size = "page",
}: {
  nextIncomeDate: string | null;
  frequency: IncomeFrequency;
  today: string;
  form?: React.ReactNode;
  size?: "page" | "section";
}) {
  const proposed = nextIncomeDate ? proposedNextIncomeDate(nextIncomeDate, frequency, today) : null;
  return (
    <div data-testid="income-date-prompt">
      <StatePanel
        size={size}
        icon={CalendarDays}
        title="Add your next income date to get a daily amount"
        description={
          nextIncomeDate ? (
            <>
              Your saved date, {formatLocalDate(nextIncomeDate)}, is today or has passed. A daily
              limit needs a date to count down to, so there isn’t one yet.
            </>
          ) : (
            "A daily limit needs a date to count down to, so there isn’t one yet. Everything else here still works."
          )
        }
        actions={
          <div className="flex w-full flex-col gap-4">
            {form}
            <div className="flex flex-wrap gap-2">
              {proposed && (
                <InlineAction
                  action={setNextIncomeDate}
                  fields={{ nextIncomeDate: proposed }}
                  pendingLabel="Saving…"
                  variant="outline"
                  size="default"
                >
                  Use {formatLocalDate(proposed)}
                </InlineAction>
              )}
              <Button
                asChild
                variant={form ? "ghost" : "default"}
                className={form ? "-ml-3 text-muted-foreground" : undefined}
              >
                <Link href="/settings#settings-income">Set your next income date</Link>
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}
