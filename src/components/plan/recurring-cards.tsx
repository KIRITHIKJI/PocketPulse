import { Archive, Pause, Play, SkipForward } from "lucide-react";

import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { RecordDueButton } from "@/components/plan/due-forms";
import { RecurringFormDialog } from "@/components/plan/recurring-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type LocalDate,
  type Paise,
  type RecurringTemplate,
  firstOccurrenceOnOrAfter,
} from "@/domain";
import {
  archiveRecurring,
  cancelBill,
  setRecurringPaused,
  skipOccurrence,
} from "@/lib/actions/recurring";
import { type EntryKit } from "@/lib/data/entry-kit";
import { formatLocalDate } from "@/lib/format";
import { type DueItem } from "@/lib/plan-view";

function everyText(t: RecurringTemplate) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[t.cadence];
  return t.intervalCount === 1 ? `Every ${unit}` : `Every ${t.intervalCount} ${unit}s`;
}

type Money = (paise: Paise) => string;

/** One due or upcoming item: what it is, when, and how to record, skip or cancel it. */
export function DueItemCard({ item, kit, money }: { item: DueItem; kit: EntryKit; money: Money }) {
  return (
    <Card className="h-full gap-2" data-testid="due-item">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{item.title}</h3>
          <p className="text-xs text-muted-foreground">
            {item.overdue ? "Was due" : "Due"} {formatLocalDate(item.dueDate)}
          </p>
        </div>
        <p className="tabular shrink-0 font-semibold">
          {item.kind === "income" ? "+" : ""}
          {money(item.amountPaise)}
        </p>
      </div>
      <p className="flex flex-wrap gap-1">
        <Badge variant="outline">{item.label === "Bill" ? "Planned, not paid" : item.label}</Badge>
        {item.overdue && <Badge variant="warning">Overdue</Badge>}
        {item.counted && <Badge variant="outline">Counted in safe-to-spend</Badge>}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2">
        <RecordDueButton item={item} kit={kit} />
        {item.source === "recurring" ? (
          <InlineAction
            action={skipOccurrence}
            fields={{
              templateId: item.templateId!,
              occurrence: item.occurrence!,
            }}
            pendingLabel="Skipping…"
            aria-label={`Skip ${item.title} on ${formatLocalDate(item.dueDate)}`}
          >
            <SkipForward aria-hidden="true" />
            Skip
          </InlineAction>
        ) : (
          <ConfirmAction
            action={cancelBill}
            fields={{ id: item.commitmentId! }}
            trigger={
              <Button variant="ghost" size="sm">
                Cancel bill
              </Button>
            }
            title={`Cancel ${item.title}?`}
            description={
              <p>
                It stops coming off safe-to-spend. If you already recorded this payment as an entry,
                cancelling is right: that keeps it from being subtracted twice.
              </p>
            }
            confirmLabel="Cancel bill"
            pendingLabel="Cancelling…"
          />
        )}
      </div>
    </Card>
  );
}

/** One recurring template: its schedule and the edit, pause and archive actions. */
export function RecurringTemplateCard({
  template: t,
  kit,
  today,
  money,
}: {
  template: RecurringTemplate;
  kit: EntryKit;
  today: LocalDate;
  money: Money;
}) {
  const next = firstOccurrenceOnOrAfter(t, t.nextDueDate > today ? t.nextDueDate : today);
  return (
    <Card className="h-full gap-2" data-testid="recurring-template">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{t.title}</h3>
          <p className="text-xs text-muted-foreground">
            {t.kind === "income" ? "Income" : "Expense"} · {everyText(t)}
            {t.pausedAt ? " · paused" : next ? ` · next ${formatLocalDate(next)}` : " · ended"}
          </p>
        </div>
        <p className="tabular shrink-0 font-semibold">{money(t.amountPaise)}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1 border-t pt-2">
        <RecurringFormDialog template={t} kit={kit} />
        <InlineAction
          action={setRecurringPaused}
          fields={{ id: t.id, pause: t.pausedAt ? "false" : "true" }}
          pendingLabel="Saving…"
        >
          {t.pausedAt ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          {t.pausedAt ? "Resume" : "Pause"}
        </InlineAction>
        <ConfirmAction
          action={archiveRecurring}
          fields={{ id: t.id }}
          trigger={
            <Button variant="ghost" size="sm">
              <Archive aria-hidden="true" />
              Archive
            </Button>
          }
          title={`Archive ${t.title}?`}
          description={
            <p>It stops being forecast. Entries it already created stay in your history.</p>
          }
          confirmLabel="Archive"
          pendingLabel="Archiving…"
        />
      </div>
    </Card>
  );
}
