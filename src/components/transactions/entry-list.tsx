"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
  in: "text-positive",
  neutral: "text-muted-foreground",
} as const;

function useIsNew(id: string) {
  return useToast().highlightId === id;
}

/** One entry as a tappable card row (phones, and Home's recent list). */
export function EntryCard({ entry }: { entry: ListedEntry }) {
  const isNew = useIsNew(entry.id);
  return (
    <li>
      <Link
        href={`/transactions/${entry.id}`}
        data-testid="entry-card"
        className={cn(
          "flex min-h-14 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
          isNew && "pp-new-entry",
        )}
      >
        <CategoryBadge icon={entry.categoryIcon} color={entry.categoryColor} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{entry.title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {[entry.categoryLabel, entry.walletLabel, entry.timeLabel].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className={cn("tabular shrink-0 font-semibold", TONE[entry.tone])}>
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
    <tr className={cn("border-t transition-colors hover:bg-accent/60", isNew && "pp-new-entry")}>
      <td className="tabular py-2.5 pr-3 pl-4 text-muted-foreground">{entry.timeLabel}</td>
      <td className="max-w-72 py-2.5 pr-3">
        <Link
          href={`/transactions/${entry.id}`}
          className="flex items-center gap-2 rounded font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <CategoryBadge icon={entry.categoryIcon} color={entry.categoryColor} size="sm" />
          <span className="truncate">{entry.title}</span>
        </Link>
      </td>
      <td className="py-2.5 pr-3 text-muted-foreground">{entry.categoryLabel ?? "—"}</td>
      <td className="py-2.5 pr-3 text-muted-foreground">{entry.walletLabel ?? "—"}</td>
      <td className={cn("tabular py-2.5 pr-4 text-right font-semibold", TONE[entry.tone])}>
        {entry.amountLabel}
      </td>
    </tr>
  );
}

/** History grouped by day: cards on phones and tablets, a table on wide screens. */
export function EntryList({ days }: { days: ListedDay[] }) {
  return (
    <>
      <div className="flex flex-col gap-4 lg:hidden" data-testid="history-cards">
        {days.map((day) => (
          <section key={day.date} aria-label={day.label} className="flex flex-col gap-1">
            <h2 className="flex items-baseline justify-between px-2 text-sm font-semibold">
              {day.label}
              {day.summary && (
                <span className="tabular text-xs font-normal text-muted-foreground">
                  {day.summary}
                </span>
              )}
            </h2>
            <ul className="flex flex-col rounded-2xl border bg-card p-1">
              {day.entries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-2xl border bg-card lg:block">
        <table className="w-full text-sm" data-testid="history-table">
          <caption className="sr-only">Transactions, newest first</caption>
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
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
          {days.map((day) => (
            <tbody key={day.date}>
              <tr className="border-t bg-muted/20">
                <th scope="colgroup" colSpan={4} className="py-2 pl-4 text-left font-semibold">
                  {day.label}
                </th>
                <td className="tabular py-2 pr-4 text-right text-xs text-muted-foreground">
                  {day.summary}
                </td>
              </tr>
              {day.entries.map((entry) => (
                <EntryTableRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </>
  );
}
