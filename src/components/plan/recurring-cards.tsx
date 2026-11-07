import { Archive, Pause, Play, SkipForward } from "lucide-react";

import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { RecordDueButton } from "@/components/plan/due-forms";
import { RecurringFormDialog } from "@/components/plan/recurring-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

function everyText(t: RecurringTemplate) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[t.cadence];
  return t.intervalCount === 1 ? `Every ${unit}` : `Every ${t.intervalCount} ${unit}s`;
}

type Money = (paise: Paise) => string;

/** The timeline's date mark: day over month, from the same "20 Oct 2026" text as everywhere. */
function DateMark({ date, overdue }: { date: LocalDate; overdue: boolean }) {
  const [day, month] = formatLocalDate(date).split(" ");
  return (
    <time
      dateTime={date}
      aria-hidden="true"
      className={cn(
        "flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-inset py-1.5",
        overdue && "bg-feedback-warning/10",
      )}
    >
      <span className="type-heading leading-none money">{day}</span>
      <span className="type-caption text-text-secondary">{month}</span>
    </time>
  );
}

/** One due or upcoming item as a timeline row: when, what, how much, and record, skip or cancel. */
export function DueItemCard({ item, kit, money }: { item: DueItem; kit: EntryKit; money: Money }) {
  const income = item.kind === "income";
  return (
    <div className="flex flex-col gap-2 py-3" data-testid="due-item">
      <div className="flex items-start gap-3">
        <DateMark date={item.dueDate} overdue={item.overdue} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 truncate type-body font-medium">{item.title}</h3>
            <p
              className={cn(
                "shrink-0 type-body font-semibold money",
                income && "text-money-positive",
              )}
            >
              {income ? "+" : ""}
              {money(item.amountPaise)}
            </p>
          </div>
          <p className="type-caption text-text-secondary">
            {item.overdue ? "Was due" : "Due"} {formatLocalDate(item.dueDate)}
          </p>
          <p className="flex flex-wrap gap-1">
            <Badge variant="outline">
              {item.label === "Bill" ? "Planned, not paid" : item.label}
            </Badge>
            {item.overdue && <Badge variant="warning">Overdue</Badge>}
            {item.counted && <Badge variant="outline">Counted in safe-to-spend</Badge>}
          </p>
          <div className="flex flex-wrap items-center gap-1 pt-1">
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
                    It stops coming off safe-to-spend. If you already recorded this payment as an
                    entry, cancelling is right: that keeps it from being subtracted twice.
                  </p>
                }
                confirmLabel="Cancel bill"
                pendingLabel="Cancelling…"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One recurring template as a list row: its schedule and the edit, pause and archive actions. */
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
  const income = t.kind === "income";
  return (
    <div className="flex flex-col gap-1 py-3" data-testid="recurring-template">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate type-body font-medium">{t.title}</h3>
          <p className="type-caption text-text-secondary">
            {income ? "Income" : "Expense"} · {everyText(t)}
            {t.pausedAt ? " · paused" : next ? ` · next ${formatLocalDate(next)}` : " · ended"}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 type-body font-semibold money",
            income && "text-money-positive",
            t.pausedAt && "text-muted-foreground",
          )}
        >
          {money(t.amountPaise)}
        </p>
      </div>
      <div className="-ml-2 flex flex-wrap items-center gap-1">
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
    </div>
  );
}
