"use client";

import * as React from "react";
import { CircleAlert, Info, Trash2 } from "lucide-react";

import { CategoryPicker } from "@/components/categories/category-picker";
import { Field, MoneyField, SelectField } from "@/components/forms/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  type CategoryChoice,
  type LocalDate,
  type ParseIssue,
  instantFromLocalDateTime,
  isBeforeOpeningDate,
  isLocalDate,
} from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import type { draftProblems } from "@/lib/drafts";
import { AMOUNT_ISSUES, type ReviewDraft, dateWordNote } from "@/lib/drafts";
import { formatLocalDate } from "@/lib/format";
import { beforeOpeningText } from "@/lib/opening-note";

export function beforeOpeningNote(
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

export function DraftCard({
  draft,
  index,
  kit,
  today,
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
  today: LocalDate;
  problems: ReturnType<typeof draftProblems>;
  beforeOpeningNote: string | null;
  onEdit: (change: (draft: ReviewDraft) => ReviewDraft, answered?: readonly ParseIssue[]) => void;
  onCategory: (choice: CategoryChoice | null) => void;
  onRemove: () => void;
  onConfirm: (issue: ParseIssue) => void;
}) {
  const prefix = `draft-${draft.id}`;
  const name = draft.description.trim() || `entry ${index + 1}`;
  const dateNote = dateWordNote(draft, formatLocalDate);
  return (
    <li>
      <Card className="gap-4" data-testid="draft-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">From “{draft.source}”</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {draft.type === "income" && <Badge variant="positive">Income</Badge>}
              {!draft.category && <Badge variant="warning">Unassigned</Badge>}
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
              onEdit((d) => ({ ...d, description }), ["unclear_item"]);
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
            max={today}
            onChange={(e) => {
              const date = e.target.value;
              onEdit((d) => ({ ...d, date, dateWord: null }), ["future_date"]);
            }}
          />
          <div className="col-span-2 sm:col-span-3">
            <CategoryPicker
              id={`${prefix}-category`}
              label="Category"
              tree={draft.type === "income" ? kit.incomeTree : kit.expenseTree}
              value={draft.category}
              placeholder="Unassigned"
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

        {dateNote && (
          <p
            className="flex gap-2 rounded-lg bg-muted p-2.5 text-xs"
            role="note"
            data-testid="draft-date-note"
          >
            <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {dateNote}
          </p>
        )}
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
