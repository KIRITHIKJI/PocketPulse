import "server-only";

import { cache } from "react";

import { type Category, type CategoryRule } from "@/domain";
import { fetchAll } from "@/lib/data/paging";
import { rowToCategory, rowToCategoryRule } from "@/lib/data/mappers";
import { requireSession } from "@/lib/data/session";

export const getCategories = cache(async (): Promise<Category[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase.from("categories").select("*").order("sort_order").order("id").range(from, to),
    "your categories",
  );
  return rows.map(rowToCategory);
});

export const getCategoryRules = cache(async (): Promise<CategoryRule[]> => {
  const { supabase } = await requireSession();
  const rows = await fetchAll(
    (from, to) =>
      supabase
        .from("category_rules")
        .select("*")
        .order("priority", { ascending: false })
        .order("created_at")
        .range(from, to),
    "your category rules",
  );
  return rows.map(rowToCategoryRule);
});
