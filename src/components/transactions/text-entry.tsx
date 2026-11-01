"use client";

import * as React from "react";
import { ListChecks } from "lucide-react";

import { DraftReview } from "@/components/transactions/draft-review";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MAX_PARSE_LENGTH, parseEntries } from "@/domain";
import type { EntryKit } from "@/lib/data/entry-kit";
import { type ReviewDraft, buildDrafts } from "@/lib/drafts";
import { newId } from "@/lib/ids";

const EXAMPLES = ["tea 15, bus 20, snacks 35", "₹40 lunch and ₹15 tea yesterday"];

/**
 * Write → review → confirm. The transcript from voice entry lands in the same box, so both
 * routes share one parser, one review step and one save.
 */
export function TextEntry({
  kit,
  source = "parsed_text",
  value,
  onChange,
  label = "What did you spend?",
}: {
  kit: EntryKit;
  source?: "parsed_text" | "voice";
  /** Pass both to control the text from outside (voice entry fills it). */
  value?: string;
  onChange?: (text: string) => void;
  label?: string;
}) {
  const [internal, setInternal] = React.useState("");
  const text = value ?? internal;
  const setText = onChange ?? setInternal;
  const [drafts, setDrafts] = React.useState<ReviewDraft[] | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reviewCount, setReviewCount] = React.useState(0);

  function review(event: React.FormEvent) {
    event.preventDefault();
    const entries = parseEntries(text, kit.today);
    if (entries.length === 0) {
      setMessage("Write at least one thing you spent, like “tea 15”.");
      return;
    }
    setMessage(null);
    setReviewCount((n) => n + 1);
    setDrafts(
      buildDrafts(
        entries,
        { categories: kit.categories, rules: kit.rules, history: kit.history },
        newId,
      ),
    );
  }

  if (drafts) {
    return (
      <DraftReview
        key={reviewCount}
        kit={kit}
        initial={drafts}
        source={source}
        onBack={() => setDrafts(null)}
        onSaved={() => {
          setDrafts(null);
          setText("");
        }}
      />
    );
  }

  return (
    <form onSubmit={review} noValidate>
      <Card className="gap-3">
        <label htmlFor="entry-text" className="font-medium">
          {label}
        </label>
        <textarea
          id="entry-text"
          value={text}
          maxLength={MAX_PARSE_LENGTH}
          rows={3}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={EXAMPLES[0]}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? "entry-text-error" : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setMessage(null);
          }}
          className="min-h-24 rounded-xl border border-input bg-transparent px-3 py-2.5 text-base outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {message && (
          <p id="entry-text-error" role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Separate items with commas, or just keep going. You can add “yesterday” or a date, and
          you’ll check everything before it’s saved.
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-10 rounded-full py-1.5 whitespace-normal"
              onClick={() => setText(example)}
            >
              {example}
            </Button>
          ))}
        </div>
        <Button type="submit" size="lg" className="self-stretch sm:self-end">
          <ListChecks aria-hidden="true" />
          Review entries
        </Button>
      </Card>
    </form>
  );
}
