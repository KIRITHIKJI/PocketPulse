import { NextResponse, type NextRequest } from "next/server";

import { csvDocument, paiseToDecimalString } from "@/domain";
import { requireSession } from "@/lib/data/session";

// Everything the user owns. Reads go through the signed-in client, so RLS decides what comes back:
// another user's rows can't appear here even if this list or a filter were wrong.
const TABLES = [
  "profiles",
  "accounts",
  "categories",
  "category_rules",
  "transactions",
  "budgets",
  "savings_goals",
  "commitments",
  "recurring_templates",
  "quick_add_presets",
  "notification_preferences",
  "notifications",
  "xp_events",
  "user_achievements",
  "user_quests",
  "streak_state",
] as const;

const PAGE = 1000;

export async function GET(request: NextRequest) {
  const { supabase } = await requireSession();
  const tables: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: "Couldn’t build your export." }, { status: 500 });
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    tables[table] = rows;
  }

  const date = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "private, no-store" };
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const rows = tables.transactions as Record<string, unknown>[];
    const names = (table: string, key: string) =>
      new Map(
        (tables[table] as Record<string, unknown>[]).map((r) => [r.id, String(r[key] ?? "")]),
      );
    const accounts = names("accounts", "name");
    const categories = names("categories", "name");
    const body = csvDocument(
      [
        "Id",
        "Occurred at",
        "Type",
        "Amount (paise)",
        "Amount",
        "Currency",
        "Description",
        "Merchant",
        "Category",
        "Subcategory",
        "Wallet",
        "From wallet",
        "To wallet",
        "Note",
        "Tags",
        "Source",
        "Deleted at",
      ],
      rows.map((tx) => {
        const name = (map: Map<unknown, string>, id: unknown) => (id ? (map.get(id) ?? "") : "");
        return [
          String(tx.id),
          String(tx.occurred_at),
          String(tx.type),
          { number: String(tx.amount_paise) },
          { number: paiseToDecimalString(Number(tx.amount_paise)) },
          String(tx.currency),
          String(tx.description ?? ""),
          String(tx.merchant ?? ""),
          name(categories, tx.category_id),
          name(categories, tx.subcategory_id),
          name(accounts, tx.account_id),
          name(accounts, tx.from_account_id),
          name(accounts, tx.to_account_id),
          String(tx.note ?? ""),
          ((tx.tags as string[] | null) ?? []).join("; "),
          String(tx.source),
          String(tx.deleted_at ?? ""),
        ];
      }),
    );
    return new NextResponse(body, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pocketpulse-entries-${date}.csv"`,
      },
    });
  }
  return new NextResponse(
    JSON.stringify({ exportedAt: new Date().toISOString(), tables }, null, 2),
    {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="pocketpulse-export-${date}.json"`,
      },
    },
  );
}
