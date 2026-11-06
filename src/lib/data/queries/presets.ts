import "server-only";

import { cache } from "react";

import { DataLoadError } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";

export interface QuickAddPreset {
  id: string;
  label: string;
  icon: string | null;
  /** null = ask every time (tiles start without amounts; the app never invents prices). */
  amountPaise: number | null;
  categoryId: string | null;
  subcategoryId: string | null;
  archived: boolean;
}

/** Quick-add tiles in display order, hidden ones included (the editor can restore them). */
export const getQuickAddPresets = cache(async (): Promise<QuickAddPreset[]> => {
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("quick_add_presets")
    .select("id, label, icon, amount_paise, category_id, subcategory_id, archived_at")
    .order("sort_order")
    .order("created_at");
  if (error) throw new DataLoadError("your quick-add tiles", error.code);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    icon: (r.icon as string | null) ?? null,
    amountPaise: r.amount_paise === null ? null : Number(r.amount_paise),
    categoryId: (r.category_id as string | null) ?? null,
    subcategoryId: (r.subcategory_id as string | null) ?? null,
    archived: r.archived_at !== null,
  }));
});
