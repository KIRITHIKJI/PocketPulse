import Link from "next/link";
import { ArrowLeftRight, ListOrdered, Repeat, Sparkles, TriangleAlert } from "lucide-react";

import { RowLink } from "@/components/insights/parts";
import { ChangeArrow, NoInsights } from "@/components/insights/sections";
import { StatePanel } from "@/components/states/state-panel";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import {
  type InsightWords,
  type InsightsModel,
  type Paise,
  type SpendingScope,
  periodScope,
} from "@/domain";
import { formatLocalDate } from "@/lib/format";
import {
  type InsightSelection,
  UNCATEGORIZED_QUEUE,
  historyHref,
  insightHref,
} from "@/lib/insights-view";

type Money = (paise: Paise) => string;

const CADENCE = { weekly: "weekly", monthly: "monthly", regular: "regular" } as const;

/** The period total against the previous comparable window, as one sentence under the total. */
export function ComparisonLine({
  model,
  words,
  money,
}: {
  model: InsightsModel;
  words: InsightWords;
  money: Money;
}) {
  const { comparison } = model;
  if (!comparison?.comparable || !model.previousWindow) {
    return (
      <p className="type-body text-muted-foreground" data-testid="compare-sparse">
        Not enough data to compare yet. {model.comparisonNote}
      </p>
    );
  }
  const delta = comparison.total.deltaPaise;
  const previous = (
    <Link
      href={historyHref({ type: "spending", ...periodScope(model.previousWindow) })}
      className="money underline underline-offset-2"
    >
      {money(comparison.total.previousPaise)}
    </Link>
  );
  const when = `${formatLocalDate(model.previousWindow.startDate!)} to ${formatLocalDate(model.previousWindow.endDate!)}`;
  return (
    <p className="type-body text-text-secondary" data-testid="comparison">
      {delta === 0 ? (
        <>The same as {words.previous ?? "before"}</>
      ) : (
        <>
          <span className="font-semibold text-foreground money">{money(Math.abs(delta))}</span>{" "}
          {delta > 0 ? "more" : "less"} than {words.previous ?? "before"}
        </>
      )}{" "}
      ({previous}, {when}).
    </p>
  );
}

/** The model's headline sentences, each opening exactly the entries behind it. */
export function StandoutCard({ model, words }: { model: InsightsModel; words: InsightWords }) {
  return (
    <Surface className="min-w-0" data-testid="insight-cards">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" aria-hidden="true" />
            What stands out
          </span>
        }
      />
      {model.cards.length === 0 ? (
        <NoInsights words={words} />
      ) : (
        <ul className="-mx-2 flex flex-col divide-y">
          {model.cards.map((card) => (
            <li key={card.id} className="py-0.5">
              <RowLink href={historyHref(card.scope)} testId="insight-card">
                <span className="type-body">{card.text}</span>
              </RowLink>
              {card.kind === "unassigned" && (
                <Link
                  href={UNCATEGORIZED_QUEUE}
                  className="mx-2 mb-2 inline-flex min-h-11 items-center type-body font-medium text-primary underline underline-offset-2 sm:min-h-0"
                >
                  Open the Uncategorized queue
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/** The categories that changed most against the previous comparable window. */
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
  const comparable = model.comparison?.comparable && model.previousWindow;
  return (
    <Surface className="min-w-0" data-testid="comparison-card">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" />
            Biggest changes
          </span>
        }
        meta={words.previous ? `Compared with ${words.previous}` : "Compared with before"}
      />
      {!comparable ? (
        <StatePanel
          size="section"
          title="Nothing to compare yet"
          description="Category changes show up once an earlier period has spending too."
        />
      ) : model.changes.length === 0 ? (
        <p className="type-body text-muted-foreground">No category changed.</p>
      ) : (
        <ul className="-mx-2 flex flex-col divide-y">
          {model.changes.slice(0, 5).map((item) => (
            <li key={item.key}>
              <RowLink href={insightHref(`/insights/category/${item.key}`, selection)}>
                <span className="flex items-center gap-2 type-body">
                  <ChangeArrow up={item.deltaPaise > 0} />
                  <span className="min-w-0 flex-1 truncate">{words.labelOf(item.key)}</span>
                  <span className="shrink-0 money">
                    <span className="text-muted-foreground">{money(item.previousPaise)} → </span>
                    {money(item.currentPaise)}
                  </span>
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </Surface>
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
    <Surface className="min-w-0" data-testid="frequent">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <ListOrdered className="size-4 text-muted-foreground" aria-hidden="true" />
            Most frequent
          </span>
        }
      />
      {model.frequent.length === 0 && model.merchants.length === 0 ? (
        <p className="type-body text-muted-foreground">Nothing has repeated yet {words.period}.</p>
      ) : (
        <ul className="-mx-2 flex flex-col divide-y">
          {[...model.frequent, ...model.merchants].map((group) => (
            <li key={`${group.by}:${group.key}`}>
              <RowLink
                href={historyHref({ ...spending, by: group.by, key: group.key })}
                testId="frequent-row"
              >
                <span className="flex items-baseline justify-between gap-2 type-body">
                  <span className="truncate">
                    {group.label}
                    {group.by === "merchant" && (
                      <span className="text-muted-foreground"> · merchant</span>
                    )}
                  </span>
                  <span className="shrink-0 money">
                    <span className="text-muted-foreground">{group.count}× · </span>
                    {money(group.netPaise)}
                  </span>
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/** Categories well above their usual spending, with how that was worked out. */
export function UnusualCard({ model }: { model: InsightsModel }) {
  return (
    <Surface className="min-w-0" data-testid="unusual">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-feedback-warning" aria-hidden="true" />
            Unusual changes
          </span>
        }
      />
      {model.unusual.length === 0 ? (
        <p className="type-body text-muted-foreground">{model.unusualNote}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {model.unusual.map((item) => (
            <li key={item.key} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
              <Link
                href={historyHref(item.scope)}
                className="inline-flex min-h-11 items-center type-body underline underline-offset-2 sm:min-h-0"
              >
                {item.text}
              </Link>
              <details>
                <summary className="inline-flex min-h-11 cursor-pointer items-center type-caption font-medium text-muted-foreground hover:text-foreground sm:min-h-8">
                  How we detected this
                </summary>
                <p className="type-caption text-muted-foreground">{item.how}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}

/** Purchases that look recurring across all history. */
export function RecurringCard({ model, money }: { model: InsightsModel; money: Money }) {
  return (
    <Surface className="min-w-0" data-testid="recurring">
      <SurfaceHeader
        title={
          <span className="flex items-center gap-2">
            <Repeat className="size-4 text-muted-foreground" aria-hidden="true" />
            Looks recurring
          </span>
        }
        meta="A signal from your dates and amounts across all history, not a fact."
      />
      {model.recurring.length === 0 ? (
        <p className="type-body text-muted-foreground">
          No regular pattern yet. A purchase needs at least 3 evenly spaced dates to show here.
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col divide-y">
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
                <span className="type-body">
                  {signal.label} looks {CADENCE[signal.cadence]}
                  {signal.cadence === "regular"
                    ? ` (about every ${signal.everyDays} days)`
                    : ""}: {signal.count} payments of about{" "}
                  <span className="money">{money(signal.typicalPaise)}</span>, last on{" "}
                  {formatLocalDate(signal.lastDate)}.
                </span>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
