import { DataLoadError } from "@/lib/data/errors";

type Row = Record<string, unknown>;
type Page = PromiseLike<{ data: Row[] | null; error: { code?: string } | null }>;

/** PostgREST's default max rows per request. */
export const PAGE = 1000;

/** Reads every row of a query, page by page, so large lists are never silently truncated. */
export async function fetchAll(
  build: (from: number, to: number) => Page,
  what: string,
  pageSize = PAGE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new DataLoadError(what, error.code);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/** Where the previous page of the ledger ended. */
export interface LedgerCursor {
  occurredAt: string;
  id: string;
}

/**
 * The PostgREST `or` filter for rows after `cursor` in ledger order (newest first, then by id).
 * The timestamp is quoted because it contains `.`, `:` and `+`.
 */
export function afterLedgerRow({ occurredAt, id }: LedgerCursor): string {
  return `occurred_at.lt."${occurredAt}",and(occurred_at.eq."${occurredAt}",id.gt.${id})`;
}

/**
 * Reads the whole ledger a page at a time. Each page continues after the last row of the one
 * before (keyset paging), which the `(owner_id, occurred_at desc, id)` index answers directly, so
 * a late page costs no more than the first, unlike skipping rows with an offset.
 */
export async function fetchLedgerPages(
  build: (after: LedgerCursor | null, limit: number) => Page,
  what: string,
  pageSize = PAGE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let after: LedgerCursor | null = null; ;) {
    const { data, error } = await build(after, pageSize);
    if (error) throw new DataLoadError(what, error.code);
    rows.push(...(data ?? []));
    const last = data?.at(-1);
    if (!data || data.length < pageSize || !last) return rows;
    after = { occurredAt: String(last.occurred_at), id: String(last.id) };
  }
}
