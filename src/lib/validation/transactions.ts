/**
 * Full transaction form → ledger command. Only the amount and (for spending/income) a category
 * are essential; the date/time default to now in the user's timezone and may be in the past,
 * never the future (planned bills belong in Income & recurring).
 */
import { z } from "zod";

import {
  type CurrencyCode,
  type Instant,
  instantFromLocalDateTime,
  isLocalDate,
  isLocalTime,
} from "@/domain";
import { amountField, optionalTextField } from "@/lib/forms";
import {
  ENTRY_TYPES,
  type EntryDraft,
  type EntryPatch,
  type EntryType,
  type LedgerCommand,
} from "@/lib/ledger/commands";

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  expense: "Expense",
  income: "Income",
  refund: "Refund",
  transfer: "Transfer",
};

/** Allowance for clock differences between the device and the server. */
const FUTURE_TOLERANCE_MS = 5 * 60_000;

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid("Choose an option from the list.").nullable());

/** "chai, hostel , Chai" → ["chai", "hostel"]: trimmed, de-duplicated (case-insensitively). */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim().replace(/^#/, "");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

const tagsField = z
  .string()
  .transform(parseTags)
  .pipe(
    z
      .array(z.string().max(40, "Keep each tag under 40 characters."))
      .max(20, "Use at most 20 tags."),
  );

export function entryFormSchema(context: { timeZone: string; now: Instant }) {
  return z
    .object({
      mode: z.enum(["create", "edit"]),
      id: z.uuid("This form is out of date. Reload the page."),
      opId: z.uuid("This form is out of date. Reload the page."),
      version: z.string().transform((v) => (v === "" ? null : Number(v))),
      type: z.enum(ENTRY_TYPES, "Choose a type."),
      amount: amountField,
      categoryId: optionalId,
      subcategoryId: optionalId,
      accountId: optionalId,
      fromAccountId: optionalId,
      toAccountId: optionalId,
      refundOfId: optionalId,
      date: z.string().trim().refine(isLocalDate, "Choose a valid date."),
      time: z.string().trim().refine(isLocalTime, "Choose a valid time."),
      description: optionalTextField(200, "Description"),
      merchant: optionalTextField(120, "Merchant"),
      note: optionalTextField(1000, "Note"),
      tags: tagsField,
    })
    .superRefine((f, ctx) => {
      const issue = (path: string, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      if ((f.type === "expense" || f.type === "income") && !f.categoryId) {
        issue("categoryId", "Choose a category.");
      }
      if (f.type === "transfer") {
        if (!f.fromAccountId) issue("fromAccountId", "Choose the wallet the money leaves.");
        if (!f.toAccountId) issue("toAccountId", "Choose the wallet the money goes to.");
        if (f.fromAccountId && f.fromAccountId === f.toAccountId) {
          issue("toAccountId", "Choose two different wallets.");
        }
      } else if (!f.accountId) {
        issue("accountId", "Choose a wallet.");
      }
      if (f.type === "refund" && !f.refundOfId)
        issue("refundOfId", "Choose the expense it refunds.");
      if (f.mode === "edit" && (f.version === null || !Number.isSafeInteger(f.version))) {
        issue("form", "This form is out of date. Reload the page.");
      }
      if (isLocalDate(f.date) && isLocalTime(f.time)) {
        const at = instantFromLocalDateTime(f.date, f.time, context.timeZone);
        if (at > context.now + FUTURE_TOLERANCE_MS) {
          issue(
            "date",
            "That’s in the future. Record it once it happens, or plan it in Income & recurring.",
          );
        }
      }
    })
    .transform((f) => ({
      ...f,
      occurredAt: new Date(
        instantFromLocalDateTime(f.date, f.time, context.timeZone),
      ).toISOString(),
    }));
}
export type EntryForm = z.output<ReturnType<typeof entryFormSchema>>;

/** The fields a form value sets on the row, shaped for its type (other links cleared). */
function entryFields(form: EntryForm) {
  const transfer = form.type === "transfer";
  return {
    amountPaise: form.amount,
    occurredAt: form.occurredAt,
    accountId: transfer ? null : form.accountId,
    fromAccountId: transfer ? form.fromAccountId : null,
    toAccountId: transfer ? form.toAccountId : null,
    categoryId: transfer ? null : form.categoryId,
    subcategoryId: transfer || !form.categoryId ? null : form.subcategoryId,
    description: form.description,
    merchant: form.merchant,
    note: form.note,
    tags: form.tags,
  };
}

/** Turns a validated form into the ledger command it stands for. */
export function commandFromForm(form: EntryForm, currency: CurrencyCode): LedgerCommand {
  const fields = entryFields(form);
  if (form.mode === "edit") {
    return {
      kind: "update",
      opId: form.opId,
      id: form.id,
      expectedVersion: form.version!,
      patch: fields satisfies EntryPatch,
    };
  }
  const draft: EntryDraft = {
    id: form.id,
    type: form.type,
    currency,
    refundOfId: form.type === "refund" ? form.refundOfId : null,
    source: "manual",
    ...fields,
  };
  return { kind: "create", opId: form.opId, draft };
}
