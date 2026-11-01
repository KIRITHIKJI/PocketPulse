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
 */
export function IncomeDatePrompt({
  nextIncomeDate,
  frequency,
  today,
}: {
  nextIncomeDate: string | null;
  frequency: IncomeFrequency;
  today: string;
}) {
  const proposed = nextIncomeDate ? proposedNextIncomeDate(nextIncomeDate, frequency, today) : null;
  return (
    <div data-testid="income-date-prompt">
      <StatePanel
        icon={CalendarDays}
        title="Set your next income date"
        description={
          nextIncomeDate
            ? `Your saved date, ${formatLocalDate(nextIncomeDate)}, is today or has passed. A daily limit needs a date to count down to, so there isn’t one yet.`
            : "A daily limit needs a date to count down to, so there isn’t one yet. Everything else below still works."
        }
        actions={
          <>
            <Button asChild>
              <Link href="/settings#settings-income">Set your next income date</Link>
            </Button>
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
          </>
        }
      />
    </div>
  );
}
