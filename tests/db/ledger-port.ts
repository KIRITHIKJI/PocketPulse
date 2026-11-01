import type { LedgerPort } from "@/lib/ledger/executor";

import type { Session } from "./harness";

function cast(value: unknown): string {
  if (typeof value === "boolean") return "::boolean";
  if (typeof value === "number") return "::integer";
  if (typeof value === "string") return "::uuid";
  return "::jsonb";
}

/** The executor's port over a test session: same reads and RPC calls as the Supabase client. */
let n = 0;
export function pgPort(s: Session): LedgerPort {
  return {
    async readRow(id) {
      const { rows } = await s.q("select * from public.transactions where id = $1", [id]);
      return { row: rows[0] ?? null, error: null };
    },
    async call({ fn, args }) {
      const entries = Object.entries(args);
      const sql = `select public.${fn}(${entries
        .map(([name, value], i) => `${name} => $${i + 1}${cast(value)}`)
        .join(", ")}) as r`;
      const params = entries.map(([, v]) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      );
      const sp = `cmd_${n++}`;
      await s.q(`savepoint ${sp}`);
      try {
        const { rows } = await s.q(sql, params);
        await s.q(`release savepoint ${sp}`);
        return { data: rows[0]!.r, error: null };
      } catch (e) {
        await s.q(`rollback to savepoint ${sp}`);
        const err = e as { code?: string; message?: string };
        return { data: null, error: { code: err.code, message: err.message } };
      }
    },
  };
}
