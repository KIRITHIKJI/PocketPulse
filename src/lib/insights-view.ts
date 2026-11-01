/**
 * The link between the Insights URL and the domain: which period is selected, how it reads in a
 * sentence, and how a figure's `SpendingScope` becomes the history link behind it.
 */
import type { Route } from "next";

import {
  type Category,
  type CurrencyCode,
  type InsightWords,
  type LocalDate,
  type Period,
  type SpendingScope,
  type TimeSettings,
  type TrendGranularity,
  UNCATEGORIZED,
  categoryLabel,
  comparisonWindows,
  daysBetween,
  formatMoney,
  isLocalDate,
  resolvePeriod,
} from "@/domain";
import { formatLocalDate, paiseToInput } from "@/lib/format";
import { SPENDING_FILTER } from "@/lib/history";

export const INSIGHT_PERIODS = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "previous_week", label: "Last week" },
  { value: "previous_month", label: "Last month" },
  { value: "custom", label: "Custom" },
  { value: "all_time", label: "All time" },
] as const;
export type InsightPeriodKind = (typeof INSIGHT_PERIODS)[number]["value"];

export const UNASSIGNED_LABEL = "Unassigned";
export const UNCATEGORIZED_QUEUE: Route = "/categories?tab=uncategorized";

export interface InsightSelection {
  kind: InsightPeriodKind;
  period: Period;
  /** What the custom form shows, even when the range was refused. */
  customFrom: LocalDate;
  customTo: LocalDate;
  error: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/** Reads the period from the URL. A bad custom range says so and shows this month instead. */
export function parseInsightSelection(
  params: Params,
  now: number,
  settings: TimeSettings,
): InsightSelection {
  const asked = first(params.period);
  const kind = INSIGHT_PERIODS.find((p) => p.value === asked)?.value ?? "this_month";
  const month = resolvePeriod({ kind: "this_month" }, now, settings);
  const from = first(params.from);
  const to = first(params.to);

  if (kind !== "custom") {
    return {
      kind,
      period: resolvePeriod({ kind }, now, settings),
      customFrom: month.startDate!,
      customTo: month.endDate!,
      error: null,
    };
  }
  const refuse = (error: string | null): InsightSelection => ({
    kind,
    period: month,
    customFrom: from || month.startDate!,
    customTo: to || month.endDate!,
    error,
  });
  if (!from && !to) return refuse(null);
  if (!isLocalDate(from) || !isLocalDate(to)) {
    return refuse("Choose a valid start and end date. Showing this month for now.");
  }
  if (from > to) return refuse("The end date is before the start date. Showing this month.");
  return {
    kind,
    period: resolvePeriod({ kind: "custom", from, to }, now, settings),
    customFrom: from,
    customTo: to,
    error: null,
  };
}

/** The query that keeps the selected period across Insights links. */
export function periodQuery(selection: InsightSelection): string {
  const params = new URLSearchParams({ period: selection.kind });
  if (selection.kind === "custom") {
    params.set("from", selection.period.startDate!);
    params.set("to", selection.period.endDate!);
  }
  return params.toString();
}

export const insightHref = (path: string, selection: InsightSelection, extra = ""): Route =>
  `${path}?${periodQuery(selection)}${extra}` as Route;

/** The exact history view behind a figure. */
export function historyHref(scope: SpendingScope): Route {
  const params = new URLSearchParams({
    type: scope.type === "spending" ? SPENDING_FILTER : scope.type,
  });
  if (scope.from) params.set("from", scope.from);
  if (scope.to) params.set("to", scope.to);
  if (scope.category) params.set("category", scope.category);
  if (scope.noSubcategory) params.set("nosub", "1");
  if (scope.underPaise !== undefined) params.set("under", paiseToInput(scope.underPaise));
  if (scope.by && scope.key) {
    params.set("by", scope.by);
    params.set("key", scope.key);
  }
  return `/transactions?${params.toString()}` as Route;
}

const shortRange = (from: LocalDate, to: LocalDate) =>
  from === to
    ? `on ${formatLocalDate(from)}`
    : `from ${formatLocalDate(from)} to ${formatLocalDate(to)}`;

function periodPhrase(selection: InsightSelection): string {
  const { period } = selection;
  switch (period.kind) {
    case "today":
      return "today";
    case "this_week":
      return "this week";
    case "this_month":
      return "this month";
    case "previous_week":
      return "last week";
    case "previous_month":
      return "last month";
    case "all_time":
      return "so far";
    default:
      return shortRange(period.startDate!, period.endDate!);
  }
}

function previousPhrase(period: Period, today: LocalDate): string | null {
  const windows = comparisonWindows(period, today, 1);
  if (!windows || windows.previous.length === 0) return null;
  switch (period.kind) {
    case "today":
      return "yesterday";
    case "this_week":
      return windows.inProgress ? "the same days last week" : "last week";
    case "this_month":
      return windows.inProgress ? "the same days last month" : "last month";
    case "previous_week":
      return "the week before";
    case "previous_month":
      return "the month before";
    default: {
      const days = daysBetween(period.startDate!, period.endDate!) + 1;
      return days === 1 ? "the day before" : `the ${days} days before`;
    }
  }
}

function unitWord(period: Period): string {
  if (period.kind === "this_week" || period.kind === "previous_week") return "week";
  if (period.kind === "this_month" || period.kind === "previous_month") return "month";
  if (period.kind === "today") return "day";
  return "period";
}

/** A category id as a person reads it. Unassigned is never folded into another name. */
export function categoryNamer(categories: readonly Category[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  return (key: string): string => {
    if (key === UNCATEGORIZED) return UNASSIGNED_LABEL;
    const category = byId.get(key);
    if (!category) return "Removed category";
    return (
      categoryLabel(
        category.parentId
          ? { categoryId: category.parentId, subcategoryId: category.id }
          : { categoryId: category.id, subcategoryId: null },
        byId,
      ) ?? category.name
    );
  };
}

export function insightWords(
  selection: InsightSelection,
  today: LocalDate,
  categories: readonly Category[],
  currency: CurrencyCode,
): InsightWords {
  return {
    period: periodPhrase(selection),
    previous: previousPhrase(selection.period, today),
    unit: unitWord(selection.period),
    money: (paise) => formatMoney(paise, { currency }),
    labelOf: categoryNamer(categories),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Short axis label for a trend bucket: "12 Oct" for days and weeks, "Oct 2026" for months. */
export function bucketLabel(date: LocalDate, granularity: TrendGranularity): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const name = MONTHS[month - 1]!;
  return granularity === "month" ? `${name} ${year}` : `${day} ${name}`;
}

export const TREND_LABELS: Record<TrendGranularity, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
};

export function parseGranularity(value: string | string[] | undefined): TrendGranularity | null {
  const text = first(value);
  return text === "day" || text === "week" || text === "month" ? text : null;
}
