/**
 * Recurring templates are forecasts until they happen. A template produces due dates; nothing it
 * produces is money. An occurrence stops being due when an active entry points at it (the same
 * rule as a paid commitment), or when it was skipped. So deleting that entry makes the occurrence
 * due again, and it can never count as both an actual entry and something still to pay.
 *
 * Occurrences are counted from the anchor, so 31 Jan monthly gives 28 Feb then 31 Mar, not 28 Mar.
 */
import { isActive } from "./ledger";
import type { Transaction } from "./schemas";
import type { Commitment, RecurringTemplate } from "./plan-schemas";
import { type LocalDate, addDays, addMonths } from "./time";

/** Far more than any screen shows; stops an overdue daily template growing without limit. */
const MAX_OCCURRENCES = 120;
/** How far a schedule is walked to reach `nextDueDate` (over 13 years of daily occurrences). */
const MAX_STEPS = 5_000;

export function nthOccurrence(template: RecurringTemplate, n: number): LocalDate {
  const step = n * template.intervalCount;
  switch (template.cadence) {
    case "daily":
      return addDays(template.anchorDate, step);
    case "weekly":
      return addDays(template.anchorDate, step * 7);
    case "monthly":
      return addMonths(template.anchorDate, step);
    case "yearly":
      return addMonths(template.anchorDate, step * 12);
  }
}

/** The schedule's dates in `[from, to]`, ignoring whether each has happened. */
function scheduleBetween(template: RecurringTemplate, from: LocalDate, to: LocalDate): LocalDate[] {
  const dates: LocalDate[] = [];
  for (let n = 0; n < MAX_STEPS && dates.length < MAX_OCCURRENCES; n += 1) {
    const date = nthOccurrence(template, n);
    if (date > to || (template.endDate && date > template.endDate)) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

export function isScheduledOn(template: RecurringTemplate, date: LocalDate): boolean {
  return scheduleBetween(template, date, date).length === 1;
}

/** The first scheduled date on or after `date`, or null if the schedule has ended by then. */
export function firstOccurrenceOnOrAfter(
  template: RecurringTemplate,
  date: LocalDate,
): LocalDate | null {
  for (let n = 0; n < MAX_STEPS; n += 1) {
    const occurrence = nthOccurrence(template, n);
    if (template.endDate && occurrence > template.endDate) return null;
    if (occurrence >= date) return occurrence;
  }
  return null;
}

interface DueOccurrence {
  templateId: string;
  occurrence: LocalDate;
  /** Doubles as the forecast commitment's id. */
  key: string;
}

const occurrenceKey = (templateId: string, occurrence: LocalDate) =>
  `recurring:${templateId}:${occurrence}`;

/**
 * Occurrences of active templates due on or before `until`, oldest first: everything from
 * `nextDueDate` on that has no active entry and wasn't skipped.
 */
export function dueOccurrences(
  template: RecurringTemplate,
  ledger: readonly Transaction[],
  commitments: readonly Commitment[],
  until: LocalDate,
): DueOccurrence[] {
  if (template.pausedAt || template.archivedAt) return [];
  const recorded = new Set<LocalDate>();
  for (const tx of ledger) {
    if (
      (tx.type === "expense" || tx.type === "income") &&
      tx.recurringTemplateId === template.id &&
      tx.recurringOccurrence &&
      isActive(tx)
    ) {
      recorded.add(tx.recurringOccurrence);
    }
  }
  const skipped = new Set(
    commitments.flatMap((c) =>
      c.recurringTemplateId === template.id && c.recurringOccurrence && c.cancelledAt
        ? [c.recurringOccurrence]
        : [],
    ),
  );
  return scheduleBetween(template, template.nextDueDate, until)
    .filter((date) => !recorded.has(date) && !skipped.has(date))
    .map((occurrence) => ({
      templateId: template.id,
      occurrence,
      key: occurrenceKey(template.id, occurrence),
    }));
}

/**
 * Upcoming expense occurrences as commitments, so safe-to-spend subtracts one list. These rows
 * exist only for this calculation: they are forecasts, not saved commitments, and income templates
 * never appear here because expected income is never counted before it arrives.
 */
export function forecastCommitments(
  templates: readonly RecurringTemplate[],
  ledger: readonly Transaction[],
  commitments: readonly Commitment[],
  until: LocalDate,
): Commitment[] {
  return templates
    .filter((t) => t.kind === "expense")
    .flatMap((template) =>
      dueOccurrences(template, ledger, commitments, until).map((due): Commitment => ({
        id: due.key,
        ownerId: template.ownerId,
        title: template.title,
        amountPaise: template.amountPaise,
        dueDate: due.occurrence,
        categoryId: template.categoryId,
        subcategoryId: template.subcategoryId,
        accountId: template.accountId,
        note: null,
        recurringTemplateId: null,
        recurringOccurrence: null,
        paidTransactionId: null,
        cancelledAt: null,
      })),
    );
}
