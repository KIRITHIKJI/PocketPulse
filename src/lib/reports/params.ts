/**
 * The report's choices, kept in the URL: the preview and every export read the same parameters,
 * so what you download is exactly what you reviewed.
 */
import {
  type Category,
  type ParentReport,
  type ReportOptions,
  type TimeSettings,
  buildReport,
  comparisonWindows,
  toLocalDate,
} from "@/domain";
import type { AccountRecord, Profile } from "@/lib/data/queries";
import { formatLocalDate } from "@/lib/format";
import {
  type InsightSelection,
  insightWords,
  parseInsightSelection,
  periodQuery,
} from "@/lib/insights-view";

type Params = Record<string, string | string[] | undefined>;

/** A checkbox sends a hidden "0" then "1" when ticked, so the last value is the answer. */
const last = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value.at(-1) : value) ?? "";

export function parseReportOptions(
  params: Params,
  profile: Pick<Profile, "includeNotesInReports">,
) {
  const flag = (key: string, fallback: boolean) =>
    last(params[key]) === "" ? fallback : last(params[key]) === "1";
  const hide = [params.hide ?? []]
    .flat()
    .join(",")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    includeTransactions: flag("details", false),
    includeNotes: flag("notes", profile.includeNotesInReports),
    compare: flag("compare", true),
    hiddenCategoryIds: [...new Set(hide)],
  } satisfies ReportOptions;
}

export function reportQuery(selection: InsightSelection, options: ReportOptions): string {
  const params = new URLSearchParams(periodQuery(selection));
  params.set("details", options.includeTransactions ? "1" : "0");
  params.set("notes", options.includeNotes ? "1" : "0");
  params.set("compare", options.compare ? "1" : "0");
  if (options.hiddenCategoryIds.length > 0) params.set("hide", options.hiddenCategoryIds.join(","));
  return params.toString();
}

function periodLabel(selection: InsightSelection) {
  const { period } = selection;
  if (period.startDate === null || period.endDate === null) return "All time";
  return period.startDate === period.endDate
    ? formatLocalDate(period.startDate)
    : `${formatLocalDate(period.startDate)} to ${formatLocalDate(period.endDate)}`;
}

export function reportFor(input: {
  params: Params;
  profile: Profile;
  accounts: readonly AccountRecord[];
  ledger: Parameters<typeof buildReport>[0]["ledger"];
  categories: readonly Category[];
  now: number;
}): { report: ParentReport; selection: InsightSelection; options: ReportOptions } {
  const { params, profile, accounts, ledger, categories, now } = input;
  const settings: TimeSettings = {
    timeZone: profile.timeZone,
    weekStartsOn: profile.weekStartsOn,
  };
  const today = toLocalDate(now, profile.timeZone);
  const selection = parseInsightSelection(params, now, settings);
  const options = parseReportOptions(params, profile);
  const windows = comparisonWindows(selection.period, today, 1);
  const label = insightWords(selection, today, categories, profile.currency).previous;
  const report = buildReport({
    accounts,
    ledger,
    categories,
    period: selection.period,
    periodLabel: periodLabel(selection),
    comparison:
      windows?.previous[0] && label
        ? { current: windows.current, previous: windows.previous[0], label }
        : null,
    now,
    settings,
    currency: profile.currency,
    options,
  });
  return { report, selection, options };
}
