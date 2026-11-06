import Link from "next/link";
import { Repeat, TriangleAlert } from "lucide-react";

import { NoteLine, RowLink } from "@/components/insights/parts";
import { ChangeArrow } from "@/components/insights/sections";
import { Card } from "@/components/ui/card";
import {
  type InsightWords,
  type InsightsModel,
  type Paise,
  type SpendingScope,
  periodScope,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";
import { type InsightSelection, historyHref, insightHref } from "@/lib/insights-view";

type Money = (paise: Paise) => string;

const CADENCE = { weekly: "weekly", monthly: "monthly", regular: "regular" } as const;

/** Spending against the previous comparable window, with the categories that changed most. */
export function ComparisonCard({
  model,
  words,
  selection,
  money,
}: {
  model: InsightsModel;
  words: InsightWords;
  selection: InsightSelection;
  money: Money;
}) {
  const { comparison } = model;
  return (
    <Card className="min-w-0 gap-3" data-testid="comparison">
      <h2 className="font-semibold">
        {words.previous ? `Compared with ${words.previous}` : "Compared with before"}
      </h2>
      {comparison?.comparable && model.previousWindow ? (
        <>
          <p className="text-sm">
            <span className="tabular font-semibold">{money(comparison.total.currentPaise)}</span>{" "}
            against{" "}
            <Link
              href={historyHref({ type: "spending", ...periodScope(model.previousWindow) })}
              className="tabular underline"
            >
              {money(comparison.total.previousPaise)}
            </Link>{" "}
            ({formatLocalDate(model.previousWindow.startDate!)} to{" "}
            {formatLocalDate(model.previousWindow.endDate!)}).{" "}
            {comparison.total.deltaPaise === 0
              ? "The same."
              : `${money(Math.abs(comparison.total.deltaPaise))} ${comparison.total.deltaPaise > 0 ? "more" : "less"}.`}
          </p>
          {model.changes.length > 0 && (
            <ul className="-mx-2 flex flex-col">
              {model.changes.slice(0, 5).map((item) => (
                <li key={item.key}>
                  <RowLink href={insightHref(`/insights/category/${item.key}`, selection)}>
                    <span className="flex items-center gap-2 text-sm">
                      <ChangeArrow up={item.deltaPaise > 0} />
                      <span className="min-w-0 flex-1 truncate">{words.labelOf(item.key)}</span>
                      <span className="tabular shrink-0">
                        {money(item.previousPaise)} → {money(item.currentPaise)}
                      </span>
                    </span>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="compare-sparse">
          Not enough data to compare yet. {model.comparisonNote}
        </p>
      )}
    </Card>
  );
}

/** Purchases and merchants that repeated in the period. */
export function FrequentCard({
  model,
  words,
  spending,
  money,
}: {
  model: InsightsModel;
  words: InsightWords;
  spending: SpendingScope;
  money: Money;
}) {
  return (
    <Card className="min-w-0 gap-3" data-testid="frequent">
      <h2 className="font-semibold">Most frequent</h2>
      {model.frequent.length === 0 && model.merchants.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has repeated yet {words.period}.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {[...model.frequent, ...model.merchants].map((group) => (
            <li key={`${group.by}:${group.key}`}>
              <RowLink
                href={historyHref({ ...spending, by: group.by, key: group.key })}
                testId="frequent-row"
              >
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">
                    {group.label}
                    {group.by === "merchant" && (
                      <span className="text-muted-foreground"> · merchant</span>
                    )}
                  </span>
                  <span className="tabular shrink-0">
                    {group.count}× · {money(group.netPaise)}
                  </span>
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Categories well above their usual spending, with how that was worked out. */
export function UnusualCard({ model }: { model: InsightsModel }) {
  return (
    <Card className="min-w-0 gap-3" data-testid="unusual">
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
        <h2 className="font-semibold">Unusual changes</h2>
      </div>
      {model.unusual.length === 0 ? (
        <p className="text-sm text-muted-foreground">{model.unusualNote}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {model.unusual.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 text-sm">
              <Link href={historyHref(item.scope)} className="underline">
                {item.text}
              </Link>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  How we detected this
                </summary>
                <p className="mt-1 text-xs text-muted-foreground">{item.how}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Purchases that look recurring across all history. */
export function RecurringCard({ model, money }: { model: InsightsModel; money: Money }) {
  return (
    <Card className="min-w-0 gap-3" data-testid="recurring">
      <div className="flex items-center gap-2">
        <Repeat className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">Looks recurring</h2>
      </div>
      {model.recurring.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No regular pattern yet. A purchase needs at least 3 evenly spaced dates to show here.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {model.recurring.map((signal) => (
            <li key={`${signal.by}:${signal.key}`}>
              <RowLink
                href={historyHref({
                  type: "spending",
                  from: null,
                  to: null,
                  by: signal.by,
                  key: signal.key,
                })}
              >
                <span className="text-sm">
                  {signal.label} looks {CADENCE[signal.cadence]}
                  {signal.cadence === "regular"
                    ? ` (about every ${signal.everyDays} days)`
                    : ""}: {signal.count} payments of about {money(signal.typicalPaise)}, last on{" "}
                  {formatLocalDate(signal.lastDate)}.
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
      <NoteLine>A signal from your dates and amounts across all history, not a fact.</NoteLine>
    </Card>
  );
}
