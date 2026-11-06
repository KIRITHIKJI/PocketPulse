/**
 * What's due, as one list for the screens: saved bills and recurring occurrences, each labelled
 * as forecast or reminder until it actually happens. Pure; every amount comes from the records.
 */
import {
  type Category,
  type Commitment,
  type LocalDate,
  type RecurringTemplate,
  type SavingsGoal,
  type Transaction,
  dueOccurrences,
  indexById,
  orphanedPurchaseReleases,
  unpaidCommitmentsDue,
} from "@/domain";

export type DueLabel = "Bill" | "Forecast" | "Reminder";

export interface DueItem {
  key: string;
  source: "bill" | "recurring";
  kind: "income" | "expense";
  title: string;
  amountPaise: number;
  dueDate: LocalDate;
  overdue: boolean;
  label: DueLabel;
  /** Inside the safe-to-spend horizon, so it's being subtracted (expenses only). */
  counted: boolean;
  commitmentId: string | null;
  templateId: string | null;
  occurrence: LocalDate | null;
  categoryId: string | null;
  subcategoryId: string | null;
  accountId: string | null;
  note: string | null;
}

export function dueItems(input: {
  commitments: readonly Commitment[];
  templates: readonly RecurringTemplate[];
  ledger: readonly Transaction[];
  today: LocalDate;
  until: LocalDate;
  countedIds: readonly string[];
}): DueItem[] {
  const { commitments, templates, ledger, today, until } = input;
  const counted = new Set(input.countedIds);
  const bills = unpaidCommitmentsDue(
    commitments.filter((c) => c.recurringTemplateId === null),
    ledger,
    until,
  ).map((c): DueItem => ({
    key: c.id,
    source: "bill",
    kind: "expense",
    title: c.title,
    amountPaise: c.amountPaise,
    dueDate: c.dueDate,
    overdue: c.dueDate < today,
    label: "Bill",
    counted: counted.has(c.id),
    commitmentId: c.id,
    templateId: null,
    occurrence: null,
    categoryId: c.categoryId,
    subcategoryId: c.subcategoryId,
    accountId: c.accountId,
    note: c.note,
  }));
  const recurring = templates.flatMap((t) =>
    dueOccurrences(t, ledger, commitments, until).map((due): DueItem => ({
      key: due.key,
      source: "recurring",
      kind: t.kind,
      title: t.title,
      amountPaise: t.amountPaise,
      dueDate: due.occurrence,
      overdue: due.occurrence < today,
      label: t.mode === "remind" ? "Reminder" : "Forecast",
      counted: t.kind === "expense" && counted.has(due.key),
      commitmentId: null,
      templateId: t.id,
      occurrence: due.occurrence,
      categoryId: t.categoryId,
      subcategoryId: t.subcategoryId,
      accountId: t.accountId,
      note: null,
    })),
  );
  return [...bills, ...recurring].sort(
    (a, b) =>
      (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) || (a.key < b.key ? -1 : 1),
  );
}

interface OccurredItem {
  key: string;
  title: string;
  amountPaise: number;
  transactionId: string;
  kind: "income" | "expense";
}

/** What really happened: paid bills and confirmed occurrences, newest first. */
export function occurredItems(
  commitments: readonly Commitment[],
  templates: readonly RecurringTemplate[],
  ledger: readonly Transaction[],
  limit: number,
): OccurredItem[] {
  const byId = indexById(ledger);
  const titles = new Map(templates.map((t) => [t.id, t.title]));
  const items: (OccurredItem & { at: string })[] = [];
  for (const c of commitments) {
    const tx = c.paidTransactionId ? byId.get(c.paidTransactionId) : undefined;
    if (tx?.type !== "expense" || tx.deletedAt || tx.voidedAt) continue;
    items.push({
      key: c.id,
      title: c.title,
      amountPaise: tx.amountPaise,
      transactionId: tx.id,
      kind: "expense",
      at: tx.occurredAt,
    });
  }
  for (const tx of ledger) {
    if ((tx.type !== "expense" && tx.type !== "income") || !tx.recurringTemplateId) continue;
    if (tx.deletedAt || tx.voidedAt) continue;
    items.push({
      key: tx.id,
      title: titles.get(tx.recurringTemplateId) ?? tx.description ?? "Recurring item",
      amountPaise: tx.amountPaise,
      transactionId: tx.id,
      kind: tx.type,
      at: tx.occurredAt,
    });
  }
  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit)
    .map(({ at: _at, ...item }) => item);
}

export interface GoalReleaseNote {
  releaseId: string;
  goalId: string;
  goalTitle: string;
  amountPaise: number;
  /** The release's row version and tags, so "keep it flexible" is an ordinary checked edit. */
  version: number;
  tags: string[];
}

/** One note per release whose purchase was deleted. See `orphanedPurchaseReleases`. */
export function goalReleaseNotes(
  ledger: readonly Transaction[],
  goals: readonly SavingsGoal[],
  versions: ReadonlyMap<string, number>,
): GoalReleaseNote[] {
  const titles = new Map(goals.map((g) => [g.id, g.title]));
  return orphanedPurchaseReleases(ledger).map((release) => ({
    releaseId: release.id,
    goalId: release.goalId,
    goalTitle: titles.get(release.goalId) ?? "your goal",
    amountPaise: release.amountPaise,
    version: versions.get(release.id) ?? 1,
    tags: release.tags,
  }));
}

/** Main expense categories for pickers that work at that level (budgets). */
export function mainExpenseCategories(categories: readonly Category[]): Category[] {
  return categories.filter(
    (c) => c.kind === "expense" && c.parentId === null && !c.archivedAt && !c.mergedIntoId,
  );
}
