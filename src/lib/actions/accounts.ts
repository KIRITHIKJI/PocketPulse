"use server";

import { revalidatePath } from "next/cache";

import { dbErrorMessage } from "@/lib/data/errors";
import { requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import { accountFormSchema, accountIdSchema } from "@/lib/validation/accounts";

const DUPLICATE = "You already have an active wallet with that name.";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

function parseAccount(formData: FormData) {
  return accountFormSchema.safeParse({
    name: text(formData, "name"),
    kind: text(formData, "kind"),
    openingBalance: text(formData, "openingBalance"),
    openingDate: text(formData, "openingDate"),
  });
}

export async function createAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseAccount(formData);
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const [{ data: profile }, { data: last }] = await Promise.all([
    supabase.from("profiles").select("currency").maybeSingle(),
    supabase
      .from("accounts")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const { error } = await supabase.from("accounts").insert({
    name: parsed.data.name,
    kind: parsed.data.kind,
    // One currency per user, so totals never mix currencies.
    currency: profile?.currency ?? "INR",
    opening_balance_paise: parsed.data.openingBalance,
    opening_balance_date: parsed.data.openingDate,
    sort_order: Number(last?.sort_order ?? 0) + 1,
  });
  if (error) return { status: "error", message: dbErrorMessage(error, DUPLICATE) };
  return done(`Added ${parsed.data.name}.`);
}

export async function updateAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = accountIdSchema.safeParse(text(formData, "id"));
  const parsed = parseAccount(formData);
  if (!id.success) return { status: "error", message: "That wallet doesn’t exist." };
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("accounts")
    .update({
      name: parsed.data.name,
      kind: parsed.data.kind,
      opening_balance_paise: parsed.data.openingBalance,
      opening_balance_date: parsed.data.openingDate,
    })
    .eq("id", id.data)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error, DUPLICATE) };
  if (!data?.length) return { status: "error", message: "That wallet doesn’t exist." };
  return done(`Saved ${parsed.data.name}.`);
}

function idFrom(formData: FormData) {
  const id = accountIdSchema.safeParse(text(formData, "id"));
  return id.success ? id.data : null;
}

export async function makeDefaultAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = idFrom(formData);
  if (!id) return { status: "error", message: "That wallet doesn’t exist." };
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc("set_default_account", { p_id: id });
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("Default wallet changed. New entries will use it unless you pick another.");
}

export async function setAccountArchived(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = idFrom(formData);
  if (!id) return { status: "error", message: "That wallet doesn’t exist." };
  const archive = text(formData, "archive") === "true";
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("accounts")
    .update({ archived_at: archive ? new Date().toISOString() : null })
    .eq("id", id)
    .select("name");
  if (error) return { status: "error", message: dbErrorMessage(error, DUPLICATE) };
  if (!data?.length) return { status: "error", message: "That wallet doesn’t exist." };
  return done(archive ? `Archived ${data[0]!.name}.` : `Restored ${data[0]!.name}.`);
}
