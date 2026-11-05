import { DataLoadError } from "@/lib/data/errors";
import { type LedgerCursor, afterLedgerRow, fetchAll, fetchLedgerPages } from "@/lib/data/paging";

type Row = { id: string; occurred_at: string };

// Ledger order: newest first, then by id. Ties on the timestamp straddle the page boundaries.
const rows: Row[] = Array.from({ length: 23 }, (_, i) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  occurred_at: `2026-11-0${5 - (Math.floor(i / 4) % 5)}T10:00:00.${String(Math.floor(i / 8)).padStart(3, "0")}+00:00`,
})).sort((a, b) =>
  a.occurred_at === b.occurred_at
    ? a.id.localeCompare(b.id)
    : b.occurred_at.localeCompare(a.occurred_at),
);

const isAfter = (row: Row, { occurredAt, id }: LedgerCursor) =>
  row.occurred_at < occurredAt || (row.occurred_at === occurredAt && row.id > id);

describe("fetchLedgerPages", () => {
  it.each([1, 4, 5, 22, 23, 24, 1000])(
    "reads every row once, in order, with page size %i",
    async (size) => {
      const cursors: (LedgerCursor | null)[] = [];
      const result = await fetchLedgerPages(
        async (after, limit) => {
          cursors.push(after);
          return {
            data: rows.filter((r) => !after || isAfter(r, after)).slice(0, limit),
            error: null,
          };
        },
        "entries",
        size,
      );
      expect(result).toEqual(rows);
      expect(cursors[0]).toBeNull();
      expect(cursors).toHaveLength(Math.floor(rows.length / size) + 1);
    },
  );

  it("stops on an error", async () => {
    await expect(
      fetchLedgerPages(async () => ({ data: null, error: { code: "57014" } }), "your entries"),
    ).rejects.toBeInstanceOf(DataLoadError);
  });

  it("quotes the timestamp in the continuation filter", () => {
    expect(afterLedgerRow({ occurredAt: "2026-11-05T10:00:00.5+00:00", id: "abc" })).toBe(
      'occurred_at.lt."2026-11-05T10:00:00.5+00:00",and(occurred_at.eq."2026-11-05T10:00:00.5+00:00",id.gt.abc)',
    );
  });
});

describe("fetchAll", () => {
  it("pages by offset until a short page", async () => {
    const ranges: [number, number][] = [];
    const result = await fetchAll(
      async (from, to) => {
        ranges.push([from, to]);
        return { data: rows.slice(from, to + 1), error: null };
      },
      "entries",
      10,
    );
    expect(result).toEqual(rows);
    expect(ranges).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });
});
