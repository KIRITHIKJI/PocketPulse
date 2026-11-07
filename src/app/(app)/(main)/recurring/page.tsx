import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Repeat } from "lucide-react";

import { Notice } from "@/components/feedback/notice";
import { InlineAction } from "@/components/forms/inline-action";
import { PageHeader } from "@/components/layout/page-header";
import { BillFormDialog } from "@/components/plan/due-forms";
import { RecurringFormDialog } from "@/components/plan/recurring-form";
import { DueItemCard, RecurringTemplateCard } from "@/components/plan/recurring-cards";
import { StatePanel } from "@/components/states/state-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { addDays, recurringSignals } from "@/domain";
import { unskipOccurrence } from "@/lib/actions/recurring";
import { loadEntryKit } from "@/lib/data/entry-kit";
import { loadPlan } from "@/lib/data/plan";
import { getSpendingLedger } from "@/lib/data/queries";
import { mergeLedger } from "@/lib/data/slices";
import { formatLocalDate } from "@/lib/format";
import { dueItems, occurredItems } from "@/lib/plan-view";

export const metadata: Metadata = { title: "Income & recurring" };

const LOOK_AHEAD_DAYS = 45;

/** Phones: jump between the two halves; both stay on the page, so nothing is hidden. */
function SectionJump() {
  const link =
    "flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 type-body font-medium text-muted-foreground transition-colors duration-(--duration-quick) hover:bg-surface-2 hover:text-foreground";
  return (
    <nav aria-label="Sections" className="lg:hidden">
      <ul className="flex gap-1 rounded-xl border bg-surface-inset p-1">
        <li className="flex flex-1">
          <a href="#upcoming" className={link}>
            Upcoming
          </a>
        </li>
        <li className="flex flex-1">
          <a href="#items" className={link}>
            Items
          </a>
        </li>
      </ul>
    </nav>
  );
}

export default async function RecurringPage() {
  // "Looks recurring" reads all purchases; the rest of the screen uses the plan's rows.
  const [plan, kit, spending] = await Promise.all([
    loadPlan(),
    loadEntryKit(),
    getSpendingLedger(),
  ]);
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
  const signals = recurringSignals(mergeLedger(ledger, spending), today, settings)
    .filter((s) => s.cadence !== "regular" && !named.has(s.label.toLowerCase()))
    .slice(0, 3);
  const empty = due.length === 0 && active.length === 0 && occurred.length === 0;

  const signalCard = signals.length > 0 && (
    <Surface data-testid="recurring-signals">
      <SurfaceHeader title="These look regular" meta="From what you’ve already recorded." />
      <ul className="-my-1 flex flex-col divide-y">
        {signals.map((signal) => (
          <li key={signal.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span className="min-w-0 flex-1 basis-48 type-body">
              {signal.label}: about <span className="money">{money(signal.typicalPaise)}</span>{" "}
              {signal.cadence === "weekly" ? "a week" : "a month"}{" "}
              <span className="text-text-secondary">
                (<span className="money">{signal.count}</span> times so far)
              </span>
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
    </Surface>
  );

  return (
    <>
      <PageHeader
        title="Income & recurring"
        description="What’s expected, kept apart from what actually happened."
        actions={
          empty ? undefined : (
            <>
              <BillFormDialog kit={kit} />
              <RecurringFormDialog kit={kit} />
            </>
          )
        }
      />

      {empty ? (
        <>
          <StatePanel
            icon={Repeat}
            title="Nothing recurring yet"
            description="Add income or a regular bill so Safe to Spend can plan around it."
            actions={
              <>
                <RecurringFormDialog kit={kit} />
                <BillFormDialog kit={kit} />
              </>
            }
          />
          {signalCard}
        </>
      ) : (
        <>
          <SectionJump />
          <div className="grid gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
            <div className="flex min-w-0 flex-col gap-4 lg:col-span-7 lg:gap-6">
              <Surface asChild>
                <section id="upcoming" className="scroll-mt-20" aria-labelledby="due-heading">
                  <SurfaceHeader>
                    <h2 id="due-heading" className="type-heading">
                      Due and upcoming
                    </h2>
                    <p className="type-caption text-text-secondary">
                      The next <span className="money">{LOOK_AHEAD_DAYS}</span> days. Planned, not
                      in your balance yet.
                    </p>
                  </SurfaceHeader>
                  {due.length === 0 ? (
                    <StatePanel
                      size="section"
                      icon={CalendarClock}
                      title="Nothing due"
                      description={`Nothing due in the next ${LOOK_AHEAD_DAYS} days.`}
                    />
                  ) : (
                    <ul className="-my-3 flex flex-col divide-y" data-testid="due-list">
                      {due.slice(0, 40).map((item) => (
                        <li key={item.key} className="min-w-0">
                          <DueItemCard item={item} kit={kit} money={money} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </Surface>

              {occurred.length > 0 && (
                <Surface asChild>
                  <section aria-labelledby="occurred-heading">
                    <SurfaceHeader>
                      <h2 id="occurred-heading" className="type-heading">
                        Actually happened
                      </h2>
                      <p className="type-caption text-text-secondary">
                        Recorded entries. Open one to see or change it.
                      </p>
                    </SurfaceHeader>
                    <ul className="-mx-2 -my-1 flex flex-col divide-y" data-testid="occurred-list">
                      {occurred.map((item) => (
                        <li key={item.key}>
                          <Link
                            href={`/transactions/${item.transactionId}`}
                            className="flex min-h-14 items-center justify-between gap-3 rounded-lg px-2 type-body transition-colors duration-(--duration-quick) hover:bg-surface-2 lg:min-h-11"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <CalendarClock
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="truncate">{item.title}</span>
                              <Badge variant="positive">Recorded</Badge>
                            </span>
                            <span
                              className={
                                item.kind === "income"
                                  ? "shrink-0 text-money-positive money"
                                  : "shrink-0 money"
                              }
                            >
                              {money(item.amountPaise)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                </Surface>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4 lg:col-span-5 lg:gap-6">
              <Surface asChild>
                <section id="items" className="scroll-mt-20" aria-labelledby="templates-heading">
                  <SurfaceHeader>
                    <h2 id="templates-heading" className="type-heading">
                      Recurring items
                    </h2>
                    <p className="type-caption text-text-secondary">
                      Schedules that forecast. Nothing is booked until you confirm it.
                    </p>
                  </SurfaceHeader>
                  {active.length === 0 ? (
                    <StatePanel
                      size="section"
                      icon={Repeat}
                      title="No recurring items"
                      description="Use Add recurring above for an allowance, rent or a subscription."
                    />
                  ) : (
                    <ul className="-my-3 flex flex-col divide-y">
                      {active.map((t) => (
                        <li key={t.id} className="min-w-0">
                          <RecurringTemplateCard
                            template={t}
                            kit={kit}
                            today={today}
                            money={money}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </Surface>

              {signalCard}

              {skipped.length > 0 && (
                <Surface asChild>
                  <section aria-labelledby="skipped-heading">
                    <SurfaceHeader>
                      <h2 id="skipped-heading" className="type-heading">
                        Skipped
                      </h2>
                      <p className="type-caption text-text-secondary">From the last month.</p>
                    </SurfaceHeader>
                    <ul className="-my-1 flex flex-col divide-y">
                      {skipped.map((c) => (
                        <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
                          <span className="min-w-0 flex-1 type-body text-muted-foreground">
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
                </Surface>
              )}
            </div>
          </div>
        </>
      )}

      <Notice>
        Forecast and Reminder items aren’t in your balance. Expected income never counts until you
        record it. Paying something means one real entry, and it leaves the upcoming list in that
        same save.
      </Notice>
    </>
  );
}
