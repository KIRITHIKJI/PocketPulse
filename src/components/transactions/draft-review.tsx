"use client";

import * as React from "react";
import { CircleAlert, Info, LoaderCircle, Trash2 } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
import { Field, MoneyField, SelectField } from "@/components/forms/form-parts";
import { useLedger } from "@/components/transactions/use-ledger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type CategoryChoice,
  type ParseIssue,
  formatMoney,
  instantFromLocalDateTime,
  isBeforeOpeningDate,
  isLocalDate,
  parseAmountInput,
  sumPaise,
} from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import {
  AMOUNT_ISSUES,
  type ReviewDraft,
  clearIssues,
  commandFromDrafts,
  draftProblems,
  refreshSuggestion,
} from "@/lib/drafts";
import { formatLocalDate } from "@/lib/format";
import { newId } from "@/lib/ids";
import { MAX_BATCH_SIZE } from "@/lib/ledger/commands";
import { beforeOpeningText } from "@/lib/opening-note";

/**
 * The review step of typed and voice entry: nothing is saved until the user confirms, and then
 * every draft is saved together or not at all.
 */
export function DraftReview({
  kit,
  initial,
  source,
  onSaved,
  onBack,
}: {
  kit: EntryKit;
  initial: ReviewDraft[];
  source: "parsed_text" | "voice";
  onSaved: () => void;
  onBack: () => void;
}) {
  const { run } = useLedger();
  const [drafts, setDrafts] = React.useState(initial);
  const [accountId, setAccountId] = React.useState(kit.defaultAccountId);
  const [pending, setPending] = React.useState(false);
  // Fixed until the save succeeds: a retry replays the same batch instead of adding a second.
  const [opId] = React.useState(newId);
  const confirmedAt = React.useRef<string | null>(null);

  const money = (paise: number) => formatMoney(paise, { currency: kit.currency });
  const context = { categories: kit.categories, rules: kit.rules, history: kit.history };
  const activeAccounts = kit.accounts.filter((a) => !a.archivedAt);
  const account = kit.accounts.find((a) => a.id === accountId);

  const update = (id: string, change: (draft: ReviewDraft) => ReviewDraft) =>
    setDrafts((list) => list.map((d) => (d.id === id ? change(d) : d)));

  const problems = new Map(drafts.map((d) => [d.id, draftProblems(d, kit.today, money)]));
  const blocked = [...problems.values()].filter((p) => p.length > 0).length;
  const amounts = drafts.flatMap((d) => {
    const parsed = parseAmountInput(d.amountText);
    return parsed.ok ? [parsed.paise] : [];
  });
  const uncategorized = drafts.filter((d) => !d.category).length;
  const tooMany = drafts.length > MAX_BATCH_SIZE;

  async function confirm() {
    if (blocked > 0 || drafts.length === 0 || tooMany) return;
    confirmedAt.current ??= new Date().toISOString();
    const noun = drafts.length === 1 ? "entry" : "entries";
    setPending(true);
    const result = await run(
      commandFromDrafts({
        drafts,
        opId,
        accountId,
        currency: kit.currency,
        source,
        today: kit.today,
        confirmedAt: confirmedAt.current,
        timeZone: kit.timeZone,
      }),
      { success: `Saved ${drafts.length} ${noun} · ${money(sumPaise(amounts))}` },
    );
    setPending(false);
    if (result?.ok) onSaved();
  }

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="review-heading" className="font-semibold">
          Check {drafts.length === 1 ? "this entry" : `these ${drafts.length} entries`}
        </h2>
        <p className="text-sm text-muted-foreground">
          Nothing is saved yet. Fix anything that’s wrong, then confirm.
        </p>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You removed every draft. Go back to write it again.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft, index) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              index={index}
              kit={kit}
              problems={problems.get(draft.id) ?? []}
              beforeOpeningNote={beforeOpeningNote(draft, account, kit)}
              onEdit={(change, answered = []) =>
                update(draft.id, (d) =>
                  refreshSuggestion(clearIssues(change(d), answered), context),
                )
              }
              onCategory={(choice) =>
                update(draft.id, (d) => ({
                  ...d,
                  category: choice,
                  categoryPicked: true,
                  suggestionReason: null,
                }))
              }
              onRemove={() => setDrafts((list) => list.filter((d) => d.id !== draft.id))}
              onConfirm={(issue) => update(draft.id, (d) => clearIssues(d, [issue]))}
            />
          ))}
        </ul>
      )}

      <Card className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] gap-2 p-3 sm:p-4 lg:bottom-4">
        {activeAccounts.length > 1 && (
          <SelectField
            id="review-account"
            name="accountId"
            label="Wallet for all of these"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.isDefault ? " (default)" : ""}
              </option>
            ))}
          </SelectField>
        )}
        <div className="text-sm text-muted-foreground" aria-live="polite">
          {tooMany ? (
            <p className="text-destructive">
              You can save up to {MAX_BATCH_SIZE} entries at once. Remove{" "}
              {drafts.length - MAX_BATCH_SIZE}.
            </p>
          ) : blocked > 0 ? (
            <p className="text-destructive">
              {blocked} {blocked === 1 ? "entry needs" : "entries need"} your attention before
              saving.
            </p>
          ) : (
            uncategorized > 0 && (
              <p>
                {uncategorized} without a category will wait in the Uncategorized queue. They still
                count in your totals.
              </p>
            )
          )}
          {activeAccounts.length <= 1 && account && <p>Saved to {account.name}.</p>}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button variant="outline" onClick={onBack} disabled={pending} className="h-12">
            Back to edit
          </Button>
          <Button
            size="lg"
            className="min-w-0 flex-1 px-3 sm:flex-none sm:px-6"
            onClick={confirm}
            disabled={pending || blocked > 0 || drafts.length === 0 || tooMany}
          >
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {pending
              ? "Saving…"
              : `Save ${drafts.length} ${drafts.length === 1 ? "entry" : "entries"} · ${money(sumPaise(amounts))}`}
          </Button>
        </div>
      </Card>
    </section>
  );
}

function beforeOpeningNote(
  draft: ReviewDraft,
  account: EntryKit["accounts"][number] | undefined,
  kit: EntryKit,
): string | null {
  if (!account || !isLocalDate(draft.date)) return null;
  // The rule compares calendar days, so any time on the draft's date gives the same answer.
  const at = instantFromLocalDateTime(draft.date, "12:00", kit.timeZone);
  return isBeforeOpeningDate(account, at, kit.timeZone)
    ? beforeOpeningText(account.name, formatLocalDate(account.openingBalanceDate))
    : null;
}

function DraftCard({
  draft,
  index,
  kit,
  problems,
  beforeOpeningNote: note,
  onEdit,
  onCategory,
  onRemove,
  onConfirm,
}: {
  draft: ReviewDraft;
  index: number;
  kit: EntryKit;
  problems: ReturnType<typeof draftProblems>;
  beforeOpeningNote: string | null;
  onEdit: (change: (draft: ReviewDraft) => ReviewDraft, answered?: readonly ParseIssue[]) => void;
  onCategory: (choice: CategoryChoice | null) => void;
  onRemove: () => void;
  onConfirm: (issue: ParseIssue) => void;
}) {
  const prefix = `draft-${draft.id}`;
  const name = draft.description.trim() || `entry ${index + 1}`;
  return (
    <li>
      <Card className="gap-4" data-testid="draft-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">From “{draft.source}”</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {draft.type === "income" && <Badge variant="positive">Income</Badge>}
              {!draft.category && <Badge variant="warning">Uncategorized</Badge>}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${name}`}>
            <Trash2 aria-hidden="true" />
            Remove
          </Button>
        </div>

        {problems.map((problem) => (
          <div
            key={problem.message}
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-destructive/10 p-2.5 text-sm"
          >
            <CircleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1">{problem.message}</p>
            {problem.confirm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onConfirm(problem.confirm!.clears)}
              >
                {problem.confirm.label}
              </Button>
            )}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field
            className="col-span-2"
            id={`${prefix}-description`}
            name="description"
            label="What was it?"
            value={draft.description}
            maxLength={200}
            autoComplete="off"
            onChange={(e) => {
              const description = e.target.value;
              onEdit((d) => ({ ...d, description }));
            }}
          />
          <MoneyField
            id={`${prefix}-amount`}
            name="amount"
            label="Amount"
            value={draft.amountText}
            onChange={(e) => {
              const amountText = e.target.value;
              onEdit((d) => ({ ...d, amountText }), AMOUNT_ISSUES);
            }}
          />
          <Field
            id={`${prefix}-date`}
            name="date"
            label="Date"
            type="date"
            value={draft.date}
            max={kit.today}
            onChange={(e) => {
              const date = e.target.value;
              onEdit((d) => ({ ...d, date }), ["future_date"]);
            }}
          />
          <div className="col-span-2 sm:col-span-3">
            <CategoryPicker
              id={`${prefix}-category`}
              label="Category"
              tree={draft.type === "income" ? kit.incomeTree : kit.expenseTree}
              value={draft.category}
              placeholder="Uncategorized"
              hint={
                draft.suggestionReason
                  ? `Suggested: ${draft.suggestionReason}. Change it if it’s wrong.`
                  : undefined
              }
              onChange={onCategory}
            />
          </div>
          <SelectField
            className="col-span-2 sm:col-span-1"
            id={`${prefix}-type`}
            name="type"
            label="Type"
            value={draft.type}
            onChange={(e) => {
              const type = e.target.value as ReviewDraft["type"];
              onEdit((d) => ({
                ...d,
                type,
                // Spending and income categories are separate lists.
                category: null,
                categoryPicked: false,
                suggestionReason: null,
              }));
            }}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </SelectField>
        </div>

        {note && (
          <p className="flex gap-2 rounded-lg bg-warning/10 p-2.5 text-xs" role="note">
            <Info className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden="true" />
            {note}
          </p>
        )}
      </Card>
    </li>
  );
}
