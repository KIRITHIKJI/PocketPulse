"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { firstOccurrenceOnOrAfter, toLocalDate } from "@/domain";
import { dbErrorMessage } from "@/lib/data/errors";
import { rowToRecurringTemplate } from "@/lib/data/mappers";
import { getProfile } from "@/lib/data/queries";
import { requestNow, requireSession } from "@/lib/data/session";
import { type FormState, invalid, text } from "@/lib/forms";
import {
  billFormSchema,
  nextIncomeDateSchema,
  planningSchema,
  recurringFormSchema,
  skipOccurrenceSchema,
} from "@/lib/validation/plan";

const MISSING = "That item doesn’t exist any more.";

function done(message: string): FormState {
  revalidatePath("/", "layout");
  return { status: "success", message, savedAt: Date.now() };
}

/** A planned bill: a promise to pay, never an entry until it's actually paid. */
export async function saveBill(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = billFormSchema.safeParse({
    id: text(formData, "id"),
    title: text(formData, "title"),
    amount: text(formData, "amount"),
    dueDate: text(formData, "dueDate"),
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
    accountId: text(formData, "accountId"),
    note: text(formData, "note"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("currency").maybeSingle();
  const b = parsed.data;
  const { error } = await supabase.from("commitments").upsert(
    {
      id: b.id,
      title: b.title,
      amount_paise: b.amount,
      currency: profile?.currency ?? "INR",
      due_date: b.dueDate,
      category_id: b.categoryId,
      subcategory_id: b.subcategoryId,
      account_id: b.accountId,
      note: b.note,
    },
    { onConflict: "id" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done(`Saved ${b.title}.`);
}

/**
 * A bill is paid only while its payment is an active entry, so one whose payment was deleted is
 * unpaid again and can be cancelled. Its old link goes with it, so nothing reads as paid later.
 */
export async function cancelBill(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: MISSING };
  const { supabase } = await requireSession();
  const { data: bill, error: readError } = await supabase
    .from("commitments")
    .select("paid_transaction_id")
    .eq("id", id.data)
    .maybeSingle();
  if (readError) return { status: "error", message: dbErrorMessage(readError) };
  if (!bill) return { status: "error", message: MISSING };
  const paidBy = bill.paid_transaction_id as string | null;
  if (paidBy) {
    const { data: payment, error } = await supabase
      .from("transactions")
      .select("id")
      .eq("id", paidBy)
      .is("deleted_at", null)
      .is("voided_at", null)
      .maybeSingle();
    if (error) return { status: "error", message: dbErrorMessage(error) };
    if (payment) return { status: "error", message: "That bill was already paid." };
  }
  const { error } = await supabase
    .from("commitments")
    .update({ cancelled_at: new Date().toISOString(), paid_transaction_id: null })
    .eq("id", id.data);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("Bill cancelled. It’s no longer subtracted from safe-to-spend.");
}

/** A recurring income or expense: a forecast, booked only when each occurrence is confirmed. */
export async function saveRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = recurringFormSchema.safeParse({
    id: text(formData, "id"),
    kind: text(formData, "kind"),
    title: text(formData, "title"),
    amount: text(formData, "amount"),
    cadence: text(formData, "cadence"),
    intervalCount: text(formData, "intervalCount") || "1",
    nextDueDate: text(formData, "nextDueDate"),
    endDate: text(formData, "endDate"),
    mode: text(formData, "mode"),
    categoryId: text(formData, "categoryId"),
    subcategoryId: text(formData, "subcategoryId"),
    accountId: text(formData, "accountId"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase } = await requireSession();
  const { data: profile } = await supabase.from("profiles").select("currency").maybeSingle();
  const r = parsed.data;
  const { error } = await supabase.from("recurring_templates").upsert(
    {
      id: r.id,
      kind: r.kind,
      title: r.title,
      amount_paise: r.amount,
      currency: profile?.currency ?? "INR",
      cadence: r.cadence,
      interval_count: r.intervalCount,
      // Editing restarts the schedule from the date given; recorded entries keep their own dates.
      anchor_date: r.nextDueDate,
      next_due_date: r.nextDueDate,
      end_date: r.endDate,
      mode: r.mode,
      category_id: r.categoryId,
      subcategory_id: r.subcategoryId,
      account_id: r.accountId,
    },
    { onConflict: "id" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done(`Saved ${r.title}.`);
}

/** Pausing stops forecasting; resuming picks up at the next date instead of a pile of overdue. */
export async function setRecurringPaused(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: MISSING };
  const pause = text(formData, "pause") === "true";
  const { supabase } = await requireSession();
  const patch: Record<string, unknown> = { paused_at: pause ? new Date().toISOString() : null };
  if (!pause) {
    const { data: row, error } = await supabase
      .from("recurring_templates")
      .select("*")
      .eq("id", id.data)
      .maybeSingle();
    if (error) return { status: "error", message: dbErrorMessage(error) };
    if (!row) return { status: "error", message: MISSING };
    const profile = await getProfile();
    const today = toLocalDate(requestNow(), profile.timeZone);
    const next = firstOccurrenceOnOrAfter(rowToRecurringTemplate(row), today);
    if (next) patch.next_due_date = next;
  }
  const { data, error } = await supabase
    .from("recurring_templates")
    .update(patch)
    .eq("id", id.data)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data?.length) return { status: "error", message: MISSING };
  return done(pause ? "Paused. It won’t be forecast until you resume it." : "Resumed.");
}

export async function archiveRecurring(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, "id"));
  if (!id.success) return { status: "error", message: MISSING };
  const { supabase } = await requireSession();
  const { data, error } = await supabase
    .from("recurring_templates")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("id");
  if (error) return { status: "error", message: dbErrorMessage(error) };
  if (!data?.length) return { status: "error", message: MISSING };
  return done("Archived. Entries it created stay in your history.");
}

/** Skipping is stored per occurrence, so repeating it does nothing and it can be brought back. */
export async function skipOccurrence(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = skipOccurrenceSchema.safeParse({
    templateId: text(formData, "templateId"),
    occurrence: text(formData, "occurrence"),
  });
  if (!parsed.success) return { status: "error", message: MISSING };
  const { supabase, userId } = await requireSession();
  const { templateId, occurrence } = parsed.data;
  const { data: template, error: readError } = await supabase
    .from("recurring_templates")
    .select("title, amount_paise, currency")
    .eq("id", templateId)
    .maybeSingle();
  if (readError) return { status: "error", message: dbErrorMessage(readError) };
  if (!template) return { status: "error", message: MISSING };
  const { error } = await supabase.from("commitments").upsert(
    {
      owner_id: userId,
      title: template.title,
      amount_paise: template.amount_paise,
      currency: template.currency,
      due_date: occurrence,
      recurring_template_id: templateId,
      recurring_occurrence: occurrence,
      cancelled_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,recurring_template_id,recurring_occurrence" },
  );
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("Skipped. Nothing was recorded.");
}

export async function unskipOccurrence(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = skipOccurrenceSchema.safeParse({
    templateId: text(formData, "templateId"),
    occurrence: text(formData, "occurrence"),
  });
  if (!parsed.success) return { status: "error", message: MISSING };
  const { supabase } = await requireSession();
  const { error } = await supabase
    .from("commitments")
    .delete()
    .eq("recurring_template_id", parsed.data.templateId)
    .eq("recurring_occurrence", parsed.data.occurrence);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("It’s due again.");
}

/** The two numbers Safe-to-spend asks for; frequency and amount stay in Settings › Income. */
export async function savePlanning(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = planningSchema.safeParse({
    nextIncomeDate: text(formData, "nextIncomeDate"),
    reserve: text(formData, "reserve"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, userId } = await requireSession();
  const { error } = await supabase
    .from("profiles")
    .update({
      next_income_date: parsed.data.nextIncomeDate,
      safe_to_spend_reserve_paise: parsed.data.reserve ?? 0,
    })
    .eq("id", userId);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("Saved.");
}

/** Accepts the date proposed from the income frequency once the saved date has passed. */
export async function setNextIncomeDate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = nextIncomeDateSchema.safeParse({
    nextIncomeDate: text(formData, "nextIncomeDate"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { supabase, userId } = await requireSession();
  const { error } = await supabase
    .from("profiles")
    .update({ next_income_date: parsed.data.nextIncomeDate })
    .eq("id", userId);
  if (error) return { status: "error", message: dbErrorMessage(error) };
  return done("Next income date saved.");
}
