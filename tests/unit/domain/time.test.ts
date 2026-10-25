import {
  DEFAULT_TIMEZONE,
  TimeError,
  addDays,
  addMonths,
  daysBetween,
  eachDay,
  isInPeriod,
  periodLengthDays,
  previousPeriod,
  resolvePeriod,
  startOfLocalDate,
  toLocalDate,
} from "@/domain";

import { istMs } from "./fixtures";

// Wednesday 2026-10-14, 10:00 IST
const NOW = istMs("2026-10-14", "10:00");

describe("Asia/Kolkata day boundaries", () => {
  it("defaults to Asia/Kolkata", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Kolkata");
  });

  it("starts each local day at 18:30 UTC of the previous day", () => {
    expect(new Date(startOfLocalDate("2026-10-14")).toISOString()).toBe("2026-10-13T18:30:00.000Z");
  });

  it("assigns instants around midnight IST to the right day", () => {
    expect(toLocalDate(istMs("2026-10-13", "23:59"))).toBe("2026-10-13");
    expect(toLocalDate(istMs("2026-10-14", "00:00"))).toBe("2026-10-14");
    // 20:00 UTC is already the next day in India
    expect(toLocalDate(Date.parse("2026-10-13T20:00:00Z"))).toBe("2026-10-14");
    expect(toLocalDate(Date.parse("2026-10-13T18:29:59.999Z"))).toBe("2026-10-13");
  });

  it("supports other timezones, including DST transitions", () => {
    expect(new Date(startOfLocalDate("2026-03-08", "America/New_York")).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(new Date(startOfLocalDate("2026-03-09", "America/New_York")).toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
    expect(() => toLocalDate(NOW, "Mars/Olympus")).toThrow(TimeError);
  });
});

describe("calendar arithmetic", () => {
  it("adds days and months, clamping month ends and handling leap years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(daysBetween("2026-10-14", "2026-11-01")).toBe(18);
    expect(daysBetween("2026-11-01", "2026-10-14")).toBe(-18);
  });

  it("rejects impossible dates", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(TimeError);
    expect(() => addDays("14/10/2026", 1)).toThrow(TimeError);
  });
});

describe("resolvePeriod", () => {
  const dates = (kind: Parameters<typeof resolvePeriod>[0]) => {
    const p = resolvePeriod(kind, NOW);
    return [p.startDate, p.endDate];
  };

  it("resolves named periods relative to now in IST", () => {
    expect(dates({ kind: "today" })).toEqual(["2026-10-14", "2026-10-14"]);
    expect(dates({ kind: "yesterday" })).toEqual(["2026-10-13", "2026-10-13"]);
    expect(dates({ kind: "this_week" })).toEqual(["2026-10-12", "2026-10-18"]); // Monday start
    expect(dates({ kind: "previous_week" })).toEqual(["2026-10-05", "2026-10-11"]);
    expect(dates({ kind: "this_month" })).toEqual(["2026-10-01", "2026-10-31"]);
    expect(dates({ kind: "previous_month" })).toEqual(["2026-09-01", "2026-09-30"]);
    expect(dates({ kind: "custom", from: "2026-10-01", to: "2026-10-10" })).toEqual([
      "2026-10-01",
      "2026-10-10",
    ]);
    expect(dates({ kind: "all_time" })).toEqual([null, null]);
  });

  it("supports a Sunday week start", () => {
    const p = resolvePeriod({ kind: "this_week" }, NOW, {
      timeZone: DEFAULT_TIMEZONE,
      weekStartsOn: 0,
    });
    expect([p.startDate, p.endDate]).toEqual(["2026-10-11", "2026-10-17"]);
  });

  it("uses the IST date, not the UTC date, for 'today' just after midnight", () => {
    const justAfterMidnight = istMs("2026-11-01", "00:05"); // still 31 Oct in UTC
    const p = resolvePeriod({ kind: "this_month" }, justAfterMidnight);
    expect(p.startDate).toBe("2026-11-01");
  });

  it("is half-open: midnight belongs to the new period only", () => {
    const oct = resolvePeriod({ kind: "this_month" }, NOW);
    expect(isInPeriod(istMs("2026-10-01", "00:00"), oct)).toBe(true);
    expect(isInPeriod(istMs("2026-10-31", "23:59"), oct)).toBe(true);
    expect(isInPeriod(istMs("2026-11-01", "00:00"), oct)).toBe(false);
    expect(isInPeriod(istMs("2026-09-30", "23:59"), oct)).toBe(false);
    expect(isInPeriod(istMs("2026-11-01", "00:00") - 1, oct)).toBe(true);
  });

  it("rejects backwards custom ranges", () => {
    expect(() =>
      resolvePeriod({ kind: "custom", from: "2026-10-10", to: "2026-10-01" }, NOW),
    ).toThrow(TimeError);
  });

  it("lists days and lengths of bounded periods", () => {
    const week = resolvePeriod({ kind: "this_week" }, NOW);
    expect(periodLengthDays(week)).toBe(7);
    expect(eachDay(week)).toHaveLength(7);
    expect(eachDay(resolvePeriod({ kind: "all_time" }, NOW))).toEqual([]);
  });
});

describe("previousPeriod", () => {
  const prev = (kind: Parameters<typeof resolvePeriod>[0], now = NOW) => {
    const p = previousPeriod(resolvePeriod(kind, now));
    return p && [p.startDate, p.endDate];
  };

  it("finds the comparable period before", () => {
    expect(prev({ kind: "today" })).toEqual(["2026-10-13", "2026-10-13"]);
    expect(prev({ kind: "this_week" })).toEqual(["2026-10-05", "2026-10-11"]);
    expect(prev({ kind: "this_month" })).toEqual(["2026-09-01", "2026-09-30"]);
    expect(prev({ kind: "this_month" }, istMs("2026-03-10"))).toEqual(["2026-02-01", "2026-02-28"]);
    expect(prev({ kind: "custom", from: "2026-10-01", to: "2026-10-10" })).toEqual([
      "2026-09-21",
      "2026-09-30",
    ]);
    expect(prev({ kind: "all_time" })).toBeNull();
  });
});
