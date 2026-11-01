import type { Metadata } from "next";
import Link from "next/link";
import { Archive, CalendarClock, Pause, Play, Repeat, SkipForward } from "lucide-react";

import { ConfirmAction, InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { BillFormDialog, RecordDueButton, RecurringFormDialog } from "@/components/plan/due-forms";
import { PlanNote } from "@/components/plan/parts";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type RecurringTemplate,
  addDays,
  firstOccurrenceOnOrAfter,
  recurringSignals,
} from "@/domain";
import {
  archiveRecurring,
  cancelBill,
  setRecurringPaused,
  skipOccurrence,
  unskipOccurrence,
} from "@/lib/actions/recurring";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { loadPlan } from "@/lib/data/plan";
import { formatLocalDate } from "@/lib/format";
import { dueItems, occurredItems } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Income & recurring" };

const LOOK_AHEAD_DAYS = 45;

function everyText(t: RecurringTemplate) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[t.cadence];
  return t.intervalCount === 1 ? `Every ${unit}` : `Every ${t.intervalCount} ${unit}s`;
}

export default async function RecurringPage() {
  const [plan, kit] = await Promise.all([loadPlan(), loadEntryKit()]);
  const { commitments, templates, ledger, today, money, result, settings } = plan;

  const horizon = result.inputs.horizonEndDate ?? addDays(today, LOOK_AHEAD_DAYS);
  const lookAhead = addDays(today, LOOK_AHEAD_DAYS);
  const due = dueItems({
    commitments,
    templates,
    ledger,
    today,
    until: horizon > lookAhead ? horizon : lookAhead,
    countedIds: result.inputs.commitmentIds,
  });
  const occurred = occurredItems(commitments, templates, ledger, 8);
  const active = templates.filter((t) => !t.archivedAt);
  const skipped = commitments.filter(
    (c) => c.recurringTemplateId && c.cancelledAt && c.dueDate >= addDays(today, -31),
  );
  const named = new Set(active.map((t) => t.title.toLowerCase()));
  const signals = recurringSignals(ledger, today, settings)
    .filter((s) => s.cadence !== "regular" && !named.has(s.label.toLowerCase()))
    .slice(0, 3);
  const empty = due.length === 0 && active.length === 0 && occurred.length === 0;

  return (
    <>
      <PageHeader
        title="Income & recurring"
        description="What’s expected, kept apart from what actually happened. Nothing here is booked until you confirm it."
        actions={
          <>
            <BillFormDialog kit={kit} />
            <RecurringFormDialog kit={kit} />
          </>
        }
      />

      {signals.length > 0 && (
        <Card className="gap-2" data-testid="recurring-signals">
          <h2 className="font-semibold">These look regular</h2>
          <ul className="flex flex-col gap-2">
            {signals.map((signal) => (
              <li key={signal.key} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {signal.label}: about {money(signal.typicalPaise)}{" "}
                  {signal.cadence === "weekly" ? "a week" : "a month"} ({signal.count} times so far)
                </span>
                <RecurringFormDialog
                  kit={kit}
                  template={{
                    title: signal.label,
                    amountPaise: signal.typicalPaise,
                    cadence: signal.cadence === "weekly" ? "weekly" : "monthly",
                    nextDueDate: addDays(signal.lastDate, signal.everyDays),
                  }}
                  trigger={
                    <Button variant="outline" size="sm">
                      Make recurring
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {empty ? (
        <StatePanel
          icon={Repeat}
          title="Nothing recurring yet"
          description="Add your allowance, rent or a subscription, or a one-off bill coming up. They stay forecasts until you confirm them."
        />
      ) : (
        <>
          <section aria-labelledby="due-heading" className="flex flex-col gap-3">
            <h2 id="due-heading" className="font-semibold">
              Due and upcoming
            </h2>
            {due.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing due in the next {LOOK_AHEAD_DAYS} days.
              </p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2" data-testid="due-list">
                {due.slice(0, 40).map((item) => (
                  <li key={item.key} className="min-w-0">
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
                        <Badge variant="outline">
                          {item.label === "Bill" ? "Planned, not paid" : item.label}
                        </Badge>
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
                                It stops coming off safe-to-spend. If you already recorded this
                                payment as an entry, cancelling is right: that keeps it from being
                                subtracted twice.
                              </p>
                            }
                            confirmLabel="Cancel bill"
                            pendingLabel="Cancelling…"
                          />
                        )}
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {skipped.length > 0 && (
            <section aria-labelledby="skipped-heading" className="flex flex-col gap-2">
              <h2 id="skipped-heading" className="text-sm font-semibold">
                Skipped
              </h2>
              <ul className="flex flex-col gap-1">
                {skipped.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {c.title} · {formatLocalDate(c.dueDate)}
                    </span>
                    <InlineAction
                      action={unskipOccurrence}
                      fields={{
                        templateId: c.recurringTemplateId!,
                        occurrence: c.recurringOccurrence!,
                      }}
                      pendingLabel="Restoring…"
                    >
                      Bring back
                    </InlineAction>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active.length > 0 && (
            <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
              <h2 id="templates-heading" className="font-semibold">
                Recurring items
              </h2>
              <ul className="grid gap-3 lg:grid-cols-2">
                {active.map((t) => {
                  const next = firstOccurrenceOnOrAfter(
                    t,
                    t.nextDueDate > today ? t.nextDueDate : today,
                  );
                  return (
                    <li key={t.id} className="min-w-0">
                      <Card className="h-full gap-2" data-testid="recurring-template">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-semibold">{t.title}</h3>
                            <p className="text-xs text-muted-foreground">
                              {t.kind === "income" ? "Income" : "Expense"} · {everyText(t)}
                              {t.pausedAt
                                ? " · paused"
                                : next
                                  ? ` · next ${formatLocalDate(next)}`
                                  : " · ended"}
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
                            {t.pausedAt ? (
                              <Play aria-hidden="true" />
                            ) : (
                              <Pause aria-hidden="true" />
                            )}
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
                              <p>
                                It stops being forecast. Entries it already created stay in your
                                history.
                              </p>
                            }
                            confirmLabel="Archive"
                            pendingLabel="Archiving…"
                          />
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {occurred.length > 0 && (
            <section aria-labelledby="occurred-heading" className="flex flex-col gap-2">
              <h2 id="occurred-heading" className="font-semibold">
                Actually happened
              </h2>
              <ul className="flex flex-col gap-1" data-testid="occurred-list">
                {occurred.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={`/transactions/${item.transactionId}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-sm hover:bg-accent/50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CalendarClock
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.title}</span>
                        <Badge variant="positive">Recorded</Badge>
                      </span>
                      <span className="tabular shrink-0">{money(item.amountPaise)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <PlanNote>
        Forecast and Reminder items aren’t in your balance. Expected income never counts until you
        record it. Paying something means one real entry, and it leaves the upcoming list in that
        same save.
      </PlanNote>
    </>
  );
}
