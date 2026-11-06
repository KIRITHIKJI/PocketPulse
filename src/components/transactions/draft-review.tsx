"use client";

import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { SelectField } from "@/components/forms/form-parts";
import { useLedger } from "@/components/transactions/use-ledger";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { type LocalDate, moneyFormatter, parseAmountInput, sumPaise } from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import {
  type ReviewDraft,
  clearIssues,
  commandFromDrafts,
  draftProblems,
  refreshSuggestion,
} from "@/lib/drafts";
import { newId } from "@/lib/ids";
import { MAX_BATCH_SIZE } from "@/lib/ledger/commands";
import { beforeOpeningNote, DraftCard } from "@/components/transactions/draft-card";

/**
 * The review step of typed and voice entry: nothing is saved until the user confirms, and then
 * every draft is saved together or not at all.
 */
export function DraftReview({
  kit,
  today,
  initial,
  source,
  onSaved,
  onBack,
}: {
  kit: EntryKit;
  /** The day the text was read on: a tab left open overnight must not reuse the page's date. */
  today: LocalDate;
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

  const money = moneyFormatter(kit.currency);
  const context = { categories: kit.categories, rules: kit.rules, history: kit.history };
  const activeAccounts = kit.accounts.filter((a) => !a.archivedAt);
  const account = kit.accounts.find((a) => a.id === accountId);

  const update = (id: string, change: (draft: ReviewDraft) => ReviewDraft) =>
    setDrafts((list) => list.map((d) => (d.id === id ? change(d) : d)));

  const problems = new Map(drafts.map((d) => [d.id, draftProblems(d, today, money)]));
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
        today,
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
              today={today}
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
                {uncategorized} unassigned will wait in the Uncategorized queue, and still count in
                your totals.
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
              : `${drafts.length === 1 ? "Save 1 entry" : `Save all ${drafts.length} entries`} · ${money(sumPaise(amounts))}`}
          </Button>
        </div>
      </Card>
    </section>
  );
}
