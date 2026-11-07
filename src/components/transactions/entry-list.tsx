"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, PiggyBank } from "lucide-react";

import { CategoryBadge } from "@/components/categories/category-icon";
import { useToast } from "@/components/feedback/toast";
import type { EntryView } from "@/lib/entry-view";
import { cn } from "@/lib/utils";

export type ListedEntry = EntryView & { timeLabel: string };
export type ListedDay = {
  date: string;
  label: string;
  summary: string | null;
  entries: ListedEntry[];
};

const TONE = {
  out: "text-foreground",
  in: "text-money-positive",
  neutral: "text-muted-foreground",
} as const;

const FOCUS = "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Money moved to or from a goal: still the user's, so it never looks like spending. */
function isGoalMove(entry: ListedEntry) {
  return entry.type === "allocation" || entry.type === "allocation_release";
}

function amountTone(entry: ListedEntry) {
  return isGoalMove(entry) ? "text-money-earmark" : TONE[entry.tone];
}

function EntryMark({ entry }: { entry: ListedEntry }) {
  if (isGoalMove(entry)) {
    return (
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-money-earmark/30 bg-money-earmark/10 text-money-earmark"
        aria-hidden="true"
      >
        <PiggyBank className="size-4" />
      </span>
    );
  }
  return <CategoryBadge icon={entry.categoryIcon} color={entry.categoryColor} size="sm" />;
}

function useIsNew(id: string) {
  return useToast().highlightId === id;
}

/** One entry as a tappable row (phones, and Home's recent list). */
export function EntryCard({ entry }: { entry: ListedEntry }) {
  const isNew = useIsNew(entry.id);
  return (
    <li>
      <Link
        href={`/transactions/${entry.id}`}
        data-testid="entry-card"
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-(--duration-quick) hover:bg-accent",
          FOCUS,
          isNew && "pp-new-entry",
        )}
      >
        <EntryMark entry={entry} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-body font-medium">{entry.title}</span>
          <span className="truncate type-caption text-muted-foreground">
            {[entry.categoryLabel, entry.walletLabel, entry.timeLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={cn("shrink-0 type-body font-semibold money", amountTone(entry))}>
          {entry.amountLabel}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function EntryTableRow({ entry }: { entry: ListedEntry }) {
  const isNew = useIsNew(entry.id);
  return (
    <tr
      className={cn(
        "border-t transition-colors duration-(--duration-quick) hover:bg-accent/60",
        isNew && "pp-new-entry",
      )}
    >
      <td className="py-2 pr-3 pl-4 text-muted-foreground money">{entry.timeLabel}</td>
      <td className="max-w-72 py-2 pr-3">
        <Link
          href={`/transactions/${entry.id}`}
          className={cn("flex items-center gap-2.5 rounded-md font-medium hover:underline", FOCUS)}
        >
          <EntryMark entry={entry} />
          <span className="truncate">{entry.title}</span>
        </Link>
      </td>
      <td className="py-2 pr-3 text-muted-foreground">{entry.categoryLabel ?? "—"}</td>
      <td className="py-2 pr-3 text-muted-foreground">{entry.walletLabel ?? "—"}</td>
      <td className={cn("py-2 pr-4 text-right font-semibold money", amountTone(entry))}>
        {entry.amountLabel}
      </td>
    </tr>
  );
}

/**
 * A day's entries, with two or more goal moves folded into one row that opens: they're
 * bookkeeping, not purchases, and shouldn't crowd the day.
 */
function splitDay(day: ListedDay) {
  const moves = day.entries.filter(isGoalMove);
  if (moves.length < 2) return { entries: day.entries, moves: [] as ListedEntry[] };
  return { entries: day.entries.filter((entry) => !isGoalMove(entry)), moves };
}

function movesLabel(count: number) {
  return `${count} goal moves`;
}

/** History grouped by day: rows on phones and tablets, a table on wide screens. */
export function EntryList({ days }: { days: ListedDay[] }) {
  return (
    <>
      <div className="flex flex-col gap-4 lg:hidden" data-testid="history-cards">
        {days.map((day) => {
          const { entries, moves } = splitDay(day);
          return (
            <section key={day.date} aria-label={day.label} className="flex flex-col gap-1.5">
              <h2 className="sticky top-16 z-10 -mx-1 flex items-baseline justify-between rounded-lg bg-background/90 px-3 py-1 type-caption font-semibold backdrop-blur">
                {day.label}
                {day.summary && (
                  <span className="font-normal text-muted-foreground money">{day.summary}</span>
                )}
              </h2>
              <ul className="flex flex-col divide-y rounded-2xl border border-(--surface-card-border) bg-(--surface-card-bg) p-1 shadow-(--surface-card-shadow)">
                {entries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
                {moves.length > 0 && (
                  <li>
                    <details className="group">
                      <summary
                        className={cn(
                          "flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent [&::-webkit-details-marker]:hidden",
                          FOCUS,
                        )}
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-money-earmark/30 bg-money-earmark/10 text-money-earmark"
                          aria-hidden="true"
                        >
                          <PiggyBank className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="type-body font-medium">{movesLabel(moves.length)}</span>
                          <span className="type-caption text-muted-foreground">
                            Set aside or released. Still your money.
                          </span>
                        </span>
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-quick) group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <ul className="flex flex-col pl-4">
                        {moves.map((entry) => (
                          <EntryCard key={entry.id} entry={entry} />
                        ))}
                      </ul>
                    </details>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-(--surface-card-border) bg-(--surface-card-bg) shadow-(--surface-card-shadow) lg:block">
        <table className="w-full type-body" data-testid="history-table">
          <caption className="sr-only">Transactions, newest first</caption>
          <thead className="bg-surface-inset text-left type-caption text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-3 pl-4 font-medium">
                Time
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Entry
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Category
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Wallet
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          {days.map((day) => {
            const { entries, moves } = splitDay(day);
            return (
              <tbody key={day.date}>
                <tr className="border-t bg-surface-inset/60">
                  <th
                    scope="colgroup"
                    colSpan={4}
                    className="py-2 pl-4 text-left type-caption font-semibold"
                  >
                    {day.label}
                  </th>
                  <td className="py-2 pr-4 text-right type-caption text-muted-foreground money">
                    {day.summary}
                  </td>
                </tr>
                {entries.map((entry) => (
                  <EntryTableRow key={entry.id} entry={entry} />
                ))}
                {moves.length > 0 && <GoalMoveRows moves={moves} />}
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}

/** The desktop table's folded goal moves: a summary row, then the rows once opened. */
function GoalMoveRows({ moves }: { moves: ListedEntry[] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <tr className="border-t">
        <td colSpan={5} className="p-0">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "flex min-h-11 w-full items-center gap-2.5 py-2 pr-4 pl-4 text-left text-muted-foreground hover:bg-accent/60",
              FOCUS,
            )}
          >
            <PiggyBank className="size-4 text-money-earmark" aria-hidden="true" />
            <span className="font-medium text-foreground">{movesLabel(moves.length)}</span>
            <span className="type-caption">Set aside or released. Still your money.</span>
            <ChevronDown
              className={cn(
                "ml-auto size-4 transition-transform duration-(--duration-quick)",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        </td>
      </tr>
      {open && moves.map((entry) => <EntryTableRow key={entry.id} entry={entry} />)}
    </>
  );
}
