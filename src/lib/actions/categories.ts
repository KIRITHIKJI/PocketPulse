"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { categoryTree, normalizeText } from "@/domain";
import { dbErrorMessage } from "@/lib/data/errors";
import { rowToCategory } from "@/lib/data/mappers";
import { requireSession } from "@/lib/data/session";
import { type FormState, flag, invalid, text } from "@/lib/forms";
import {
  assignCategorySchema,
  categoryFormSchema,
  mergeSchema,
  reorderSchema,
  ruleFormSchema,
} from "@/lib/validation/categories";

const DUPLICATE = "There’s already an active category with that name here.";
const MISSING = "That category doesn’t exist any more. Reload the page.";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

const fail = (message: string): FormState => ({ status: "error", message });

function parseCategory(formData: FormData) {
  return categoryFormSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind") || "expense",
    parentId: text(formData, "parentId"),
    icon: text(formData, "icon"),
    color: text(formData, "color"),
  });
}

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseCategory(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { parentId, kind } = parsed.data;

  let siblings = supabase
    .from("categories")
    .select("sort_order")
    .eq("kind", kind)
    .order("sort_order", { ascending: false })
    .limit(1);
  siblings = parentId ? siblings.eq("parent_id", parentId) : siblings.is("parent_id", null);
  const { data: last } = await siblings.maybeSingle();

  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    kind,
    parent_id: parentId,
    icon: parsed.data.icon,
    color: parsed.data.color,
    sort_order: Number(last?.sort_order ?? -1) + 1,
  });
  if (error) {
    // A missing/foreign parent fails the same-owner foreign key.
    if (error.code === "23503") return fail(MISSING);
    return fail(dbErrorMessage(error, DUPLICATE));
  }
  return done(`Added ${parsed.data.name}.`);
}

/** Rename and restyle. History references categories by id, so a rename never rewrites it. */
export async function updateCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  const parsed = parseCategory(formData);
  if (!id.success) return fail(MISSING);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name, icon: parsed.data.icon, color: parsed.data.color })
    .eq("id", id.data)
    .is("merged_into_id", null)
    .select("id");
  if (error) return fail(dbErrorMessage(error, DUPLICATE));
  if (!data?.length) return fail(MISSING);
  return done(`Saved ${parsed.data.name}.`);
}

export async function moveCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = reorderSchema.safeParse({
    id: text(formData, "id"),
    direction: text(formData, "direction"),
  });
  if (!parsed.success) return fail(MISSING);
  const { supabase } = await requireSession();
  const { data: rows, error: loadError } = await supabase.from("categories").select("*");
  if (loadError) return fail(dbErrorMessage(loadError));
  const categories = (rows ?? []).map(rowToCategory);
  const self = categories.find((c) => c.id === parsed.data.id);
  if (!self) return fail(MISSING);

  // Same order the screen shows (categoryTree), so "up" always means the row above.
  const tree = categoryTree(categories, self.kind);
  const siblings = self.parentId
    ? (tree.find((n) => n.category.id === self.parentId)?.subcategories ?? [])
    : tree.map((n) => n.category);
  const ids = siblings.map((c) => c.id);
  const index = ids.indexOf(self.id);
  const swapWith = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= ids.length) return { status: "idle" };
  [ids[index], ids[swapWith]] = [ids[swapWith]!, ids[index]!];

  const { error } = await supabase.rpc("reorder_categories", {
    p_parent: self.parentId,
    p_kind: self.kind,
    p_ids: ids,
  });
  if (error) return fail(dbErrorMessage(error));
  return done(`Moved ${self.name} ${parsed.data.direction}.`);
}

/** Archived categories disappear from pickers; entries that use them keep showing them. */
export async function setCategoryArchived(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return fail(MISSING);
  const archive = text(formData, "archive") === "true";
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("categories")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id.data)
    .is("merged_into_id", null)
    .select("name");
  if (error) return fail(dbErrorMessage(error, DUPLICATE));
  if (!data?.length) return fail(MISSING);
  return done(archive ? `Archived ${data[0]!.name}.` : `Restored ${data[0]!.name}.`);
}

export async function mergeCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = mergeSchema.safeParse({
    sourceId: text(formData, "sourceId"),
    targetId: text(formData, "targetId"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Choose where to merge it.");
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc("merge_category", {
    p_source: parsed.data.sourceId,
    p_target: parsed.data.targetId,
  });
  if (error) return fail(dbErrorMessage(error));
  const result = data as { status: string; transactions_moved?: number };
  if (result.status !== "applied") return fail(MISSING);
  const moved = result.transactions_moved ?? 0;
  return done(
    moved === 0
      ? "Merged. No entries needed moving."
      : `Merged. ${moved} ${moved === 1 ? "entry now uses" : "entries now use"} the new category; totals moved with them.`,
  );
}

function parseRule(formData: FormData) {
  return ruleFormSchema.safeParse({
    matchText: text(formData, "matchText"),
    matchField: text(formData, "matchField") || "description",
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
    priority: text(formData, "priority") || "0",
  });
}

export async function saveRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseRule(formData);
  if (!parsed.success) return invalid(parsed.error);
  const rawId = text(formData, "id");
  const parsedId = z.uuid().safeParse(rawId);
  if (rawId && !parsedId.success) return fail("That rule doesn’t exist any more.");
  const id = parsedId.success ? parsedId.data : null;
  const { supabase } = await requireSession();
  const row = {
    match_text: parsed.data.matchText,
    match_field: parsed.data.matchField,
    category_id: parsed.data.categoryId,
    subcategory_id: parsed.data.subcategoryId,
    priority: parsed.data.priority,
  };
  const { error } = id
    ? await supabase.from("category_rules").update(row).eq("id", id)
    : await supabase.from("category_rules").insert(row);
  if (error) return fail(error.code === "23503" ? MISSING : dbErrorMessage(error));
  return done(`Rule saved: “${parsed.data.matchText}”.`);
}

export async function deleteRule(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return fail("That rule doesn’t exist any more.");
  const { supabase } = await requireSession();
  const { error } = await supabase.from("category_rules").delete().eq("id", id.data);
  if (error) return fail(dbErrorMessage(error));
  return done("Rule deleted. Entries it categorised keep their category.");
}

/**
 * Categorises an entry from the Uncategorized queue, optionally remembering the choice as a
 * rule for that description. Uses the optimistic-concurrency RPC: an entry edited elsewhere in
 * the meantime is reported, never overwritten.
 */
export async function assignCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = assignCategorySchema.safeParse({
    transactionId: text(formData, "transactionId"),
    version: text(formData, "version"),
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data, error } = await supabase.rpc("update_transaction", {
    p_id: parsed.data.transactionId,
    p_expected_version: parsed.data.version,
    p_patch: { category_id: parsed.data.categoryId, subcategory_id: parsed.data.subcategoryId },
  });
  if (error) return fail(dbErrorMessage(error));
  const status = (data as { status: string }).status;
  if (status === "not_found") return fail("That entry doesn’t exist any more.");
  if (status === "conflict") {
    return fail("This entry changed on another device. Reload to see the latest version.");
  }

  const remember = text(formData, "rememberText").trim();
  if (flag(formData, "remember") && normalizeText(remember) !== "") {
    await supabase.from("category_rules").insert({
      match_text: remember.slice(0, 80),
      match_field: "description",
      category_id: parsed.data.categoryId,
      subcategory_id: parsed.data.subcategoryId,
    });
  }
  return done("Categorised.");
}
